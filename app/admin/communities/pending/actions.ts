"use server";

// I-111: review queue for communities submitted through the public Add form. Same shape as
// app/admin/events/pending/actions.ts, minus the submitter email: submissions have no login, and
// the optional contact is free text, so nobody is notified automatically.

import { revalidatePath } from "next/cache";

import { requireAdminUser } from "@/lib/admin-auth";
import { geocodeAddress } from "@/lib/geocode";
import { createAdminClient } from "@/lib/supabase/admin";

export type PendingCommunity = {
  id: string;
  name: string;
  slug: string | null;
  type: string | null;
  city: string | null;
  country: string | null;
  activityLevel: string | null;
  focus: string[];
  languages: string[];
  description: string | null;
  links: Array<{ label: string; url: string }>;
  invitePlatforms: string[];
  hasEmail: boolean;
  submitterContact: string | null;
  createdAt: string;
  possibleDuplicates: Array<{ id: string; name: string; city: string | null; status: string }>;
};

const LINK_LABELS: Array<[string, string]> = [
  ["website", "Website"],
  ["newsletter", "Newsletter"],
  ["instagram", "Instagram"],
  ["facebook_group", "Facebook group"],
  ["facebook_page", "Facebook page"],
  ["telegram_group", "Telegram group"],
  ["telegram_channel", "Telegram channel"],
  ["whatsapp_channel", "WhatsApp channel"],
  ["youtube", "YouTube"],
  ["calendar", "Calendar"],
  ["other_resource", "Other"],
];

export async function getPendingCommunities(): Promise<PendingCommunity[]> {
  await requireAdminUser();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("communities")
    .select(
      "id, name, slug, type, city, country, activity_level, focus, languages, description, website, newsletter, instagram, facebook_group, facebook_page, telegram_group, telegram_channel, whatsapp_channel, youtube, calendar, other_resource, has_email, submitter_contact, created_at, community_invites(platform)",
    )
    .eq("status", "pending")
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  return Promise.all(
    (data ?? []).map(async (c) => {
      // Dedup hint: anything already listed in the same city, plus names sharing the submission's
      // most distinctive word. Two separate queries, so a common name word can't crowd the
      // same-city matches out of the limit. Loose on purpose; the admin decides.
      const dupes = await findPossibleDuplicates(admin, c.id, c.name, c.city);

      const row = c as unknown as Record<string, string | null>;
      return {
        id: c.id,
        name: c.name,
        slug: c.slug,
        type: c.type,
        city: c.city,
        country: c.country,
        activityLevel: c.activity_level,
        focus: c.focus ?? [],
        languages: c.languages ?? [],
        description: c.description,
        links: LINK_LABELS.filter(([col]) => row[col]).map(([col, label]) => ({ label, url: row[col] as string })),
        invitePlatforms: ((c.community_invites ?? []) as Array<{ platform: string }>).map((i) => i.platform),
        hasEmail: c.has_email,
        submitterContact: c.submitter_contact,
        createdAt: c.created_at,
        possibleDuplicates: dupes ?? [],
      };
    }),
  );
}

// Words nearly every community name contains; matching on them finds everything.
const GENERIC_NAME_WORDS = new Set([
  "contact", "improvisation", "improv", "impro", "community", "communities", "jams", "group",
  "dance", "dancing", "festival", "collective", "friday", "sunday", "saturday", "weekly", "monthly",
  "open", "class", "classes", "network", "channel", "the", "and",
]);

async function findPossibleDuplicates(
  admin: ReturnType<typeof createAdminClient>,
  id: string,
  name: string,
  city: string | null,
): Promise<Array<{ id: string; name: string; city: string | null; status: string }>> {
  const safe = (s: string) => s.replace(/[,()%*]/g, " ").trim();
  const word = name
    .split(/[^\p{L}\p{N}]+/u)
    .find((w) => w.length >= 4 && !GENERIC_NAME_WORDS.has(w.toLowerCase()));

  const [byCity, byName] = await Promise.all([
    city
      ? admin.from("communities").select("id, name, city, status").neq("id", id).is("deleted_at", null)
          .ilike("city", `%${safe(city)}%`).limit(6)
      : Promise.resolve({ data: [] }),
    word
      ? admin.from("communities").select("id, name, city, status").neq("id", id).is("deleted_at", null)
          .ilike("name", `%${safe(word)}%`).limit(6)
      : Promise.resolve({ data: [] }),
  ]);

  const seen = new Set<string>();
  return [...(byCity.data ?? []), ...(byName.data ?? [])].filter((d) => !seen.has(d.id) && seen.add(d.id));
}

export async function approveCommunity(id: string): Promise<{ success: boolean; error?: string }> {
  await requireAdminUser();
  const admin = createAdminClient();

  const { data: c, error } = await admin
    .from("communities")
    .select("slug, city, country, address_for_map, lat, lng, status")
    .eq("id", id)
    .single();
  if (error || !c) return { success: false, error: error?.message ?? "Not found." };
  if (c.status !== "pending") return { success: false, error: "Already reviewed." };

  // Geocoding happens here, not on submit, so an anonymous form can't spend the quota. An admin
  // who already set coordinates in the editor keeps them. Worldwide rows (no country) get no pin.
  let { lat, lng } = c;
  if ((lat == null || lng == null) && c.country) {
    const coords = await geocodeAddress([c.address_for_map, c.city, c.country].filter(Boolean).join(", "));
    lat = coords?.lat ?? null;
    lng = coords?.lng ?? null;
  }

  const { error: updateError } = await admin
    .from("communities")
    .update({ status: "published", lat, lng })
    .eq("id", id);
  if (updateError) return { success: false, error: updateError.message };

  // Approval covers the links too (Jan, 2026-09-23: "new data = approval"). The submitter confirmed
  // on the form that they may share them, so a submitted group invite becomes revealable behind the
  // Turnstile check with the listing, instead of waiting for a separate per-link decision. The admin
  // editor can still switch one off.
  const { error: inviteError } = await admin.from("community_invites").update({ published: true }).eq("community_id", id);
  if (inviteError) return { success: false, error: inviteError.message };

  revalidatePath("/admin/communities/pending");
  revalidatePath("/admin/communities");
  revalidatePath("/communities");
  if (c.slug) revalidatePath(`/communities/${c.slug}`);
  return { success: true };
}

export async function rejectCommunity(id: string, reason: string): Promise<{ success: boolean; error?: string }> {
  await requireAdminUser();
  const admin = createAdminClient();

  const { data: c } = await admin.from("communities").select("admin_notes, status").eq("id", id).single();
  if (!c) return { success: false, error: "Not found." };
  if (c.status !== "pending") return { success: false, error: "Already reviewed." };

  const note = reason.trim() ? `Rejected ${new Date().toISOString().slice(0, 10)}: ${reason.trim()}` : null;
  const { error } = await admin
    .from("communities")
    .update({
      status: "rejected",
      admin_notes: [c.admin_notes, note].filter(Boolean).join("\n") || null,
    })
    .eq("id", id);
  if (error) return { success: false, error: error.message };

  revalidatePath("/admin/communities/pending");
  revalidatePath("/admin/communities");
  return { success: true };
}
