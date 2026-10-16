import { createAdminClient } from "@/lib/supabase/admin";
import { invitePlatformOf, type InvitePlatform } from "@/lib/community-links";

// The write path for venue_invites (migration 20261016140000), the venue twin of the community
// invites block in lib/community-save.ts. venue_invites grants nothing to anon or authenticated, so
// this uses the service role and does no authorization of its own: only the admin venue routes call
// it, after requireAdminRequestUser. Deliberately not a "use server" module, same reasoning as
// lib/entity-phone-contacts.ts.

export type VenueInviteInput = { platform: InvitePlatform; url: string; published: boolean };

export async function getVenueInvites(venueId: string): Promise<VenueInviteInput[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("venue_invites")
    .select("platform, url, published")
    .eq("venue_id", venueId)
    .order("platform");
  return (data ?? []) as VenueInviteInput[];
}

// Form rows plus any invite links typed into a public field (website, socials) become the set to
// store, one per platform. A row whose URL isn't a group invite is reported back rather than
// dropped. Rows win over moved links; a moved link starts not revealable, since revealing it is a
// consent decision the admin makes per link.
export function resolveVenueInvites(
  rows: unknown,
  extraUrls: string[] = [],
): { invites: VenueInviteInput[]; invalid: string[] } {
  const byPlatform = new Map<InvitePlatform, VenueInviteInput>();
  const invalid: string[] = [];

  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || typeof row !== "object") continue;
    const r = row as Partial<VenueInviteInput>;
    const url = typeof r.url === "string" ? r.url.trim() : "";
    if (!url) continue;
    const platform = invitePlatformOf(url);
    if (!platform) {
      invalid.push(url);
      continue;
    }
    byPlatform.set(platform, { platform, url, published: Boolean(r.published) });
  }

  for (const raw of extraUrls) {
    const platform = invitePlatformOf(raw);
    if (platform && !byPlatform.has(platform)) {
      byPlatform.set(platform, { platform, url: raw.trim(), published: false });
    }
  }

  return { invites: [...byPlatform.values()], invalid };
}

// Blanks any public field holding a group invite and hands those links back for resolveVenueInvites,
// the invite counterpart of stripPhoneLinks.
export function stripInviteLinks<K extends string>(
  fields: Record<K, string>,
): { fields: Record<K, string>; inviteUrls: string[] } {
  const inviteUrls: string[] = [];
  const clean = { ...fields };
  for (const key of Object.keys(clean) as K[]) {
    if (invitePlatformOf(clean[key])) {
      inviteUrls.push(clean[key]);
      clean[key] = "";
    }
  }
  return { fields: clean, inviteUrls };
}

export function venueInvitesErrorMessage(invalid: string[]): string {
  return (
    `Not a group invite link: ${invalid.map((u) => `"${u}"`).join(", ")}. ` +
    "Use a WhatsApp group (chat.whatsapp.com), Telegram +/joinchat, Signal group or LINE group link."
  );
}

// Replaces the venue's whole set: the form always submits every row it shows.
export async function setVenueInvites(venueId: string, invites: VenueInviteInput[]): Promise<{ error?: string }> {
  const admin = createAdminClient();
  const { error: deleteError } = await admin.from("venue_invites").delete().eq("venue_id", venueId);
  if (deleteError) return { error: deleteError.message };
  if (invites.length === 0) return {};
  const { error } = await admin.from("venue_invites").insert(
    invites.map((inv) => ({ venue_id: venueId, platform: inv.platform, url: inv.url, published: inv.published })),
  );
  return error ? { error: error.message } : {};
}
