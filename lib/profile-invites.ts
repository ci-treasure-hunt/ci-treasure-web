import { createAdminClient } from "@/lib/supabase/admin";
import { invitePlatformOf, type InvitePlatform } from "@/lib/community-links";

// The write path for profile_invites (migration 20261023120000), the profile twin of
// lib/venue-invites.ts. profile_invites grants nothing to anon or authenticated, so this uses the
// service role and does no authorization of its own: the only caller is the owner's
// updateProfile action, after its update matched the signed-in user's own profile. Deliberately
// not a "use server" module, same reasoning as lib/entity-phone-contacts.ts.

export type ProfileInviteInput = { platform: InvitePlatform; url: string };

export async function getProfileInvites(profileId: string): Promise<ProfileInviteInput[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("profile_invites")
    .select("platform, url")
    .eq("profile_id", profileId)
    .order("platform");
  return (data ?? []) as ProfileInviteInput[];
}

// Editor rows plus any invite links typed into a public field (website, socials, extra links)
// become the set to store, one per platform. A row whose URL isn't a group invite is reported back
// rather than dropped. Rows win over moved links.
export function resolveProfileInvites(
  rows: unknown,
  extraUrls: string[] = [],
): { invites: ProfileInviteInput[]; invalid: string[] } {
  const byPlatform = new Map<InvitePlatform, ProfileInviteInput>();
  const invalid: string[] = [];

  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || typeof row !== "object") continue;
    const url = typeof (row as { url?: unknown }).url === "string" ? (row as { url: string }).url.trim() : "";
    if (!url) continue;
    const platform = invitePlatformOf(url);
    if (!platform) {
      invalid.push(url);
      continue;
    }
    byPlatform.set(platform, { platform, url });
  }

  for (const raw of extraUrls) {
    const platform = invitePlatformOf(raw);
    if (platform && !byPlatform.has(platform)) {
      byPlatform.set(platform, { platform, url: raw.trim() });
    }
  }

  return { invites: [...byPlatform.values()], invalid };
}

export function profileInvitesErrorMessage(invalid: string[]): string {
  return (
    `Not a group invite link: ${invalid.map((u) => `"${u}"`).join(", ")}. ` +
    "Use a WhatsApp group (chat.whatsapp.com), Telegram +/joinchat, Signal group or LINE group link."
  );
}

// Replaces the profile's whole set: the form always submits every row it shows. Published, since
// the owner adding their own group is the consent to show it behind the verification step.
export async function setProfileInvites(profileId: string, invites: ProfileInviteInput[]): Promise<{ error?: string }> {
  const admin = createAdminClient();
  const { error: deleteError } = await admin.from("profile_invites").delete().eq("profile_id", profileId);
  if (deleteError) return { error: deleteError.message };
  if (invites.length === 0) return {};
  const { error } = await admin.from("profile_invites").insert(
    invites.map((inv) => ({ profile_id: profileId, platform: inv.platform, url: inv.url, published: true })),
  );
  return error ? { error: error.message } : {};
}
