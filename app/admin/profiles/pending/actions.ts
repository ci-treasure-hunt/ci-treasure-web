"use server";

import { revalidatePath } from "next/cache";

import { requireAdminUser } from "@/lib/admin-auth";
import { sendEmail } from "@/lib/email";
import { createAdminClient } from "@/lib/supabase/admin";

// Look up the submitter's email from the profile's user_id.
async function submitterEmail(admin: ReturnType<typeof createAdminClient>, userId: string | null) {
  if (!userId) return null;
  const { data } = await admin.auth.admin.getUserById(userId);
  return data?.user?.email ?? null;
}

export type PendingProfile = {
  id: string;
  name: string;
  slug: string;
  bio: string | null;
  city: string | null;
  country: string | null;
  website: string | null;
  facebook: string | null;
  instagram: string | null;
  isTeacher: boolean;
  isOrganizer: boolean;
  isMusician: boolean;
  // "self_submitted" (has an account, edits it themselves) vs "organizer_submitted" (name-only
  // stub, added 2026-09-19 — see suggestPersonProfile in app/events/actions.ts). Distinguished
  // in the UI because they need opposite handling: the first is close to ready, the second
  // needs a bio/photo enriched before it can go anywhere near "approve".
  source: string | null;
  submitterEmail: string | null;
  // Name of the organizer's own profile, when an organizer_submitted stub recorded one
  // (source_id) — a breadcrumb for "who suggested this, worth asking them for more."
  suggestedBy: string | null;
  createdAt: string;
};

export async function getPendingProfiles(): Promise<PendingProfile[]> {
  await requireAdminUser();
  const admin = createAdminClient();

  const { data } = await admin
    .from("profiles")
    .select(
      "id, name, slug, bio, city, country, website, facebook, instagram, is_teacher, is_organizer, is_musician, user_id, source, source_id, created_at",
    )
    .eq("visibility", "shadow")
    .in("source", ["self_submitted", "organizer_submitted"])
    .order("created_at", { ascending: true });

  const rows = data ?? [];
  const emails = await Promise.all(rows.map((row) => submitterEmail(admin, row.user_id)));
  const suggesterIds = rows
    .filter((row) => row.source === "organizer_submitted" && row.source_id)
    .map((row) => row.source_id as string);
  const { data: suggesters } =
    suggesterIds.length > 0
      ? await admin.from("profiles").select("id, name").in("id", suggesterIds)
      : { data: [] as { id: string; name: string }[] };
  const suggesterNames = new Map((suggesters ?? []).map((p) => [p.id, p.name]));

  return rows.map((row, i) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    bio: row.bio,
    city: row.city,
    country: row.country,
    website: row.website,
    facebook: row.facebook,
    instagram: row.instagram,
    isTeacher: row.is_teacher,
    isOrganizer: row.is_organizer,
    isMusician: row.is_musician,
    source: row.source,
    submitterEmail: emails[i],
    suggestedBy: row.source_id ? suggesterNames.get(row.source_id) ?? null : null,
    createdAt: row.created_at,
  }));
}

export async function approveProfile(profileId: string): Promise<{ success: boolean; error?: string }> {
  await requireAdminUser();
  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("name, slug, user_id")
    .eq("id", profileId)
    .maybeSingle();

  const { error } = await admin.from("profiles").update({ visibility: "public" }).eq("id", profileId);
  if (error) {
    return { success: false, error: error.message };
  }

  // Notify the submitter (non-fatal).
  const email = await submitterEmail(admin, profile?.user_id ?? null);
  if (email && profile) {
    const url = `https://citreasurehunt.com/teachers/${profile.slug}`;
    const result = await sendEmail({
      to: email,
      subject: `Your CI Treasure Hunt profile is now live`,
      text: [
        `Good news, your profile "${profile.name}" has been approved and is now published on CI Treasure Hunt:`,
        url,
        "",
        "You can edit it anytime from your dashboard: https://citreasurehunt.com/dashboard",
        "",
        "CI Treasure Hunt",
      ].join("\n"),
    });
    if (!result.ok) console.error("approve profile email failed:", result.error);
  }

  revalidatePath("/admin/profiles/pending");
  revalidatePath(`/teachers/${profile?.slug ?? ""}`);
  return { success: true };
}

// Rejection deletes the profile rather than keeping a "rejected" row around — unlike events,
// profile_visibility has no rejected state, and unlike an event (tied to a specific date that's
// worth preserving/resubmitting), a rejected self-submitted profile (e.g. an organization
// submitted as if it were a person) is usually a wrong-shape submission, not a fixable draft.
// The submitter can always submit again once they understand why. If this turns out to lose
// useful history in practice, revisit — add a rejected state instead of deleting.
export async function rejectProfile(
  profileId: string,
  reason: string,
): Promise<{ success: boolean; error?: string }> {
  await requireAdminUser();
  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("name, user_id")
    .eq("id", profileId)
    .maybeSingle();

  const trimmedReason = reason.trim();
  const { error } = await admin.from("profiles").delete().eq("id", profileId);
  if (error) {
    return { success: false, error: error.message };
  }

  // Notify the submitter with the reason (non-fatal).
  const email = await submitterEmail(admin, profile?.user_id ?? null);
  if (email && profile) {
    const result = await sendEmail({
      to: email,
      subject: `Your CI Treasure Hunt profile needs changes`,
      text: [
        `Your profile "${profile.name}" wasn't published.`,
        trimmedReason ? `\nReason: ${trimmedReason}` : "",
        "",
        "You're welcome to submit again from your dashboard: https://citreasurehunt.com/dashboard",
        "",
        "CI Treasure Hunt",
      ]
        .filter(Boolean)
        .join("\n"),
    });
    if (!result.ok) console.error("reject profile email failed:", result.error);
  }

  revalidatePath("/admin/profiles/pending");
  return { success: true };
}

// Leaves the profile exactly as-is (still shadow, still in this queue) — just emails the
// submitter asking for more before it can be approved. Unlike rejectProfile, nothing is deleted:
// this is for a profile that's genuinely on track (a real person, right shape) but too thin to
// publish yet, where deleting it would just make them start over from a blank form.
export async function requestMoreInfo(
  profileId: string,
  message: string,
): Promise<{ success: boolean; error?: string }> {
  await requireAdminUser();
  const admin = createAdminClient();

  const trimmedMessage = message.trim();
  if (!trimmedMessage) {
    return { success: false, error: "Message is required." };
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("name, slug, user_id")
    .eq("id", profileId)
    .maybeSingle();
  if (!profile) {
    return { success: false, error: "Profile not found." };
  }

  const email = await submitterEmail(admin, profile.user_id);
  if (!email) {
    return { success: false, error: "No submitter email on file." };
  }

  const result = await sendEmail({
    to: email,
    subject: `A bit more info needed for your CI Treasure Hunt profile`,
    text: [
      `Thanks for submitting "${profile.name}" to CI Treasure Hunt!`,
      "",
      trimmedMessage,
      "",
      `Add it from your dashboard whenever you're ready, and it'll be reviewed again: https://citreasurehunt.com/dashboard/profile/edit`,
      "",
      "CI Treasure Hunt",
    ].join("\n"),
  });
  if (!result.ok) {
    return { success: false, error: result.error ?? "Failed to send email." };
  }

  return { success: true };
}
