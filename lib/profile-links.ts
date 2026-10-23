// Extra links on a profile (profiles.links, `{ items: [{ type, url, label? }] }`), on top of the
// fixed website/facebook/instagram/youtube/telegram/newsletter columns. For a second account of
// the same kind (Huginn Wu's dance + personal Instagram, 2026-10-14) or a link with no column of
// its own (LinkedIn, Mastodon, a company site). Edited in /dashboard/profile/edit, rendered on
// /teachers/[slug]. Shared by both so the allowed types and limits can't drift apart.

import { invitePlatformOf } from "./community-links";
import { isPhoneContactUrl } from "./phone-contacts";
import { safeExternalUrl } from "./url-safety";

export const PROFILE_LINK_TYPES = ["website", "instagram", "facebook", "youtube", "telegram", "other"] as const;
export type ProfileLinkType = (typeof PROFILE_LINK_TYPES)[number];

export const PROFILE_LINK_TYPE_LABELS: Record<ProfileLinkType, string> = {
  website: "Website",
  instagram: "Instagram",
  facebook: "Facebook",
  youtube: "YouTube",
  telegram: "Telegram",
  other: "Other",
};

export const MAX_PROFILE_LINKS = 6;
const MAX_LABEL_LENGTH = 40;

export type ProfileLinkInput = { type: string; url: string; label: string };
export type ProfileLinkItem = { type: ProfileLinkType; url: string; label?: string };

export function emptyProfileLink(): ProfileLinkInput {
  return { type: "website", url: "", label: "" };
}

function isProfileLinkType(type: string): type is ProfileLinkType {
  return (PROFILE_LINK_TYPES as readonly string[]).includes(type);
}

// "@handle" is accepted for Instagram and Telegram, same as their single fields in the editor.
function expandHandle(type: ProfileLinkType, url: string): string {
  if (url.startsWith("http") || !url) return url;
  const handle = url.replace(/^@/, "");
  if (type === "instagram") return `https://instagram.com/${handle}`;
  if (type === "telegram") return `https://t.me/${handle}`;
  return url;
}

// Read side: whatever is stored, keep only well-formed rows with a safe URL. Unknown types (none
// exist today) fall back to "other" rather than being dropped.
export function readProfileLinks(raw: unknown): ProfileLinkItem[] {
  const items = raw && typeof raw === "object" && "items" in raw ? (raw as { items?: unknown }).items : null;
  if (!Array.isArray(items)) return [];
  return items.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const { type, url, label } = item as { type?: unknown; url?: unknown; label?: unknown };
    const safe = typeof url === "string" ? safeExternalUrl(url) : null;
    if (!safe) return [];
    const t = typeof type === "string" && isProfileLinkType(type) ? type : "other";
    const l = typeof label === "string" && label.trim() ? label.trim() : undefined;
    return [{ type: t, url: safe, ...(l ? { label: l } : {}) }];
  });
}

// Write side: the editor rows → the jsonb value, or null when empty. Phone links (wa.me, t.me/+…)
// and group invites (chat.whatsapp.com, t.me/+abc, …) are left out here because `links` is public;
// the caller passes them to resolvePhoneContacts / resolveProfileInvites so they land in the gated
// entity_phone_contacts / profile_invites instead, as with the single social fields.
export function parseProfileLinks(rows: ProfileLinkInput[]): { items: ProfileLinkItem[] } | null {
  const items = rows.slice(0, MAX_PROFILE_LINKS).flatMap((row) => {
    const type = isProfileLinkType(row.type) ? row.type : "other";
    const raw = expandHandle(type, row.url.trim());
    if (!raw || isPhoneContactUrl(raw) || invitePlatformOf(raw)) return [];
    const url = safeExternalUrl(raw);
    if (!url) return [];
    const label = row.label.trim().slice(0, MAX_LABEL_LENGTH);
    return [{ type, url, ...(label ? { label } : {}) }];
  });
  return items.length ? { items } : null;
}

// For the public page: a social type keeps its platform name so the row still says what it is
// ("Instagram (Personal)"); website/other show the label alone, falling back to the type name.
export function profileLinkLabel(item: ProfileLinkItem): string {
  const base = PROFILE_LINK_TYPE_LABELS[item.type];
  if (!item.label) return item.type === "other" ? "Link" : base;
  return item.type === "website" || item.type === "other" ? item.label : `${base} (${item.label})`;
}
