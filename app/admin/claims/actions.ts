"use server";

import { revalidatePath } from "next/cache";

import { requireAdminUser } from "@/lib/admin-auth";
import { claimEmailMatches } from "@/lib/claim-suggestion";
import { sendEmail } from "@/lib/email";
import { createAdminClient } from "@/lib/supabase/admin";

export type PendingClaim = {
  profileId: string;
  name: string;
  bioSnippet: string | null;
  visibility: string;
  claimerEmail: string;
  claimerUserId: string;
  claimedAt: string | null;
  // The claimant signed in with the address stored for this profile (strong hint, not proof).
  emailMatches: boolean;
};

export async function getPendingClaims(): Promise<PendingClaim[]> {
  await requireAdminUser();
  const admin = createAdminClient();

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, name, bio, visibility, claim_pending_user_id, updated_at")
    .not("claim_pending_user_id", "is", null)
    .order("updated_at", { ascending: false });

  const claims: PendingClaim[] = [];
  for (const p of profiles ?? []) {
    const { data: userData } = await admin.auth.admin.getUserById(p.claim_pending_user_id as string);
    claims.push({
      profileId: p.id as string,
      name: p.name as string,
      bioSnippet: p.bio ? String(p.bio).slice(0, 160) : null,
      visibility: p.visibility as string,
      claimerEmail: userData?.user?.email ?? "(unknown email)",
      claimerUserId: p.claim_pending_user_id as string,
      claimedAt: (p.updated_at as string) ?? null,
      emailMatches: await claimEmailMatches(p.id as string, userData?.user?.email),
    });
  }
  return claims;
}

export async function approveClaim(profileId: string): Promise<{ success: boolean; error?: string }> {
  await requireAdminUser();
  const admin = createAdminClient();

  // Read the pending claimant before clearing it.
  const { data: profile, error: readError } = await admin
    .from("profiles")
    .select("name, claim_pending_user_id")
    .eq("id", profileId)
    .maybeSingle();
  if (readError || !profile?.claim_pending_user_id) {
    return { success: false, error: "Claim not found or already resolved." };
  }

  // Grant ownership + auto-upgrade shadow → public.
  const { error: updateError } = await admin
    .from("profiles")
    .update({
      user_id: profile.claim_pending_user_id,
      claim_pending_user_id: null,
      visibility: "public",
    })
    .eq("id", profileId);
  if (updateError) {
    return { success: false, error: updateError.message };
  }

  // Notify the organizer (non-fatal if email fails — the claim is already approved).
  const { data: userData } = await admin.auth.admin.getUserById(profile.claim_pending_user_id);
  const email = userData?.user?.email;
  if (email) {
    const result = await sendEmail({
      to: email,
      subject: "Your CI Treasure Hunt profile claim was approved",
      text: [
        `Hi ${profile.name},`,
        "",
        "Your profile claim has been approved. You can now manage your events at",
        "https://citreasurehunt.com/dashboard",
        "",
        "— CI Treasure Hunt",
      ].join("\n"),
    });
    if (!result.ok) {
      console.error("approval email failed:", result.error);
    }
  }

  revalidatePath("/admin/claims");
  return { success: true };
}

export async function rejectClaim(profileId: string): Promise<{ success: boolean; error?: string }> {
  await requireAdminUser();
  const admin = createAdminClient();

  const { error } = await admin
    .from("profiles")
    .update({ claim_pending_user_id: null })
    .eq("id", profileId);
  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/admin/claims");
  return { success: true };
}

export type PendingEventClaim = {
  claimId: string;
  eventId: string;
  eventTitle: string;
  eventShortId: string;
  profileId: string;
  profileName: string;
  role: string;
  claimerEmail: string;
  createdAt: string;
};

export async function getPendingEventClaims(): Promise<PendingEventClaim[]> {
  await requireAdminUser();
  const admin = createAdminClient();

  const { data: claims } = await admin
    .from("event_claims")
    .select("id, event_id, profile_id, role, user_id, created_at, events(title, short_id), profiles(name)")
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  const result: PendingEventClaim[] = [];
  for (const c of claims ?? []) {
    const { data: userData } = await admin.auth.admin.getUserById(c.user_id as string);
    const event = c.events as unknown as { title: string; short_id: string } | null;
    const profile = c.profiles as unknown as { name: string } | null;
    result.push({
      claimId: c.id as string,
      eventId: c.event_id as string,
      eventTitle: event?.title ?? "(unknown event)",
      eventShortId: event?.short_id ?? "",
      profileId: c.profile_id as string,
      profileName: profile?.name ?? "(unknown profile)",
      role: c.role as string,
      claimerEmail: userData?.user?.email ?? "(unknown email)",
      createdAt: c.created_at as string,
    });
  }
  return result;
}

export async function approveEventClaim(claimId: string): Promise<{ success: boolean; error?: string }> {
  await requireAdminUser();
  const admin = createAdminClient();

  const { data: claim, error: readError } = await admin
    .from("event_claims")
    .select("event_id, profile_id, role, user_id, status")
    .eq("id", claimId)
    .maybeSingle();
  if (readError || !claim || claim.status !== "pending") {
    return { success: false, error: "Claim not found or already resolved." };
  }

  // Lead is the only organizer role self-service grants — co-organizer is abolished
  // (see docs/issue-backlog.md), teacher is the plain default (not musician/assistant/etc,
  // which stay admin-assigned distinctions).
  const insertError =
    claim.role === "organizer"
      ? (
          await admin
            .from("event_organizers")
            .insert({ event_id: claim.event_id, organizer_id: claim.profile_id, role: "lead" })
        ).error
      : (
          await admin
            .from("event_teachers")
            .insert({ event_id: claim.event_id, teacher_id: claim.profile_id, role: "teacher" })
        ).error;
  if (insertError) {
    return { success: false, error: insertError.message };
  }

  await admin
    .from("event_claims")
    .update({ status: "approved", reviewed_at: new Date().toISOString() })
    .eq("id", claimId);

  const { data: userData } = await admin.auth.admin.getUserById(claim.user_id);
  const email = userData?.user?.email;
  if (email) {
    const { data: event } = await admin.from("events").select("title").eq("id", claim.event_id).maybeSingle();
    const result = await sendEmail({
      to: email,
      subject: "Your CI Treasure Hunt event claim was approved",
      text: [
        `Your claim as ${claim.role} on "${event?.title ?? "the event"}" has been approved.`,
        "You can now manage it from your dashboard: https://citreasurehunt.com/dashboard",
        "",
        "— CI Treasure Hunt",
      ].join("\n"),
    });
    if (!result.ok) {
      console.error("event claim approval email failed:", result.error);
    }
  }

  revalidatePath("/admin/claims");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function rejectEventClaim(claimId: string): Promise<{ success: boolean; error?: string }> {
  await requireAdminUser();
  const admin = createAdminClient();

  const { error } = await admin
    .from("event_claims")
    .update({ status: "rejected", reviewed_at: new Date().toISOString() })
    .eq("id", claimId)
    .eq("status", "pending");
  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/admin/claims");
  return { success: true };
}
