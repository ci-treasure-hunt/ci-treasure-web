import type { User } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";

// I-074 follow-up (2026-10-15): "Is this you?" on the dashboard, for a signed-in user who owns no
// profile and has no claim pending. Only strong signals, and only a suggestion: "Yes" opens the
// existing claim confirm view, and an admin still approves every claim.
//
// 1. The sign-in email equals the address stored for a profile in entity_emails. The magic link
//    proves the user reads that inbox. Not proof of identity, though: on 2026-10-15, 23 of 106
//    stored profile addresses were shared inboxes (info@, hello@) and 28 were also an event or
//    venue contact, which is why this never links automatically.
// 2. The name Google gave us equals a profile name exactly (case-insensitive). Fuzzy matching and
//    guessing a name from the part of the address before the @ were left out on purpose: they
//    collide on common names and would show a stranger's profile as "you".
//
// Any match that is not unique (a couple sharing one address, two people with one name) shows
// nothing; manual search on /dashboard/claim still works for them.

export type ClaimSuggestion = {
  id: string;
  name: string;
  slug: string;
  roles: string;
  place: string | null;
  reason: "email" | "name";
};

type Row = {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  country: string | null;
  is_teacher: boolean;
  is_organizer: boolean;
  is_musician: boolean;
};

const COLUMNS = "id, name, slug, city, country, is_teacher, is_organizer, is_musician";

function toSuggestion(row: Row, reason: ClaimSuggestion["reason"]): ClaimSuggestion {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    roles: [row.is_teacher && "Teacher", row.is_organizer && "Organizer", row.is_musician && "Musician"]
      .filter(Boolean)
      .join(" · "),
    place: [row.city, row.country].filter(Boolean).join(", ") || null,
    reason,
  };
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

// Profiles whose stored contact address is this email (lowercased on both sides).
async function profileIdsForEmail(admin: ReturnType<typeof createAdminClient>, email: string) {
  const { data } = await admin
    .from("entity_emails")
    .select("entity_id")
    .eq("entity_type", "profile")
    .ilike("email", escapeLike(email.trim()));
  return (data ?? []).map((r) => r.entity_id as string);
}

export async function findClaimSuggestion(user: User): Promise<ClaimSuggestion | null> {
  const admin = createAdminClient();
  const claimable = () =>
    admin
      .from("profiles")
      .select(COLUMNS)
      .eq("visibility", "public")
      .is("user_id", null)
      .is("claim_pending_user_id", null);

  if (user.email) {
    const ids = await profileIdsForEmail(admin, user.email);
    if (ids.length) {
      const { data } = await claimable().in("id", ids).limit(2);
      if (data?.length === 1) return toSuggestion(data[0] as Row, "email");
      if (data && data.length > 1) return null;
    }
  }

  const meta = user.user_metadata ?? {};
  const googleName = String(meta.full_name ?? meta.name ?? "").trim();
  if (googleName.split(/\s+/).length >= 2) {
    const { data } = await claimable().ilike("name", escapeLike(googleName)).limit(2);
    if (data?.length === 1) return toSuggestion(data[0] as Row, "name");
  }

  return null;
}

// For the admin claims queue: does the claimant's sign-in email equal the profile's stored one?
export async function claimEmailMatches(profileId: string, email: string | null | undefined) {
  if (!email) return false;
  const ids = await profileIdsForEmail(createAdminClient(), email);
  return ids.includes(profileId);
}
