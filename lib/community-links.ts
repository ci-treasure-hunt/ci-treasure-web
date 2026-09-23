// I-111: classify the link fields of a community submission into public `communities` columns and
// private group invites. Port of classify_links() + the LINE rule in ci-treasure-hunt's
// scripts/sync_communities.py, which did this job while Airtable was the source of truth.
//
// Privacy-critical. A group invite link (WhatsApp group, Telegram +/joinchat, Signal group, LINE
// group) is a token that lets anyone join a private chat. Those never go into a public column: they
// belong in `community_invites`, which is only revealed behind Turnstile (I-099). Every write to
// `communities` from a form must go through classifyCommunityLinks() for that reason.
//
// Deliberately broader than the Python original: invite detection runs on EVERY field, not only the
// messaging ones, and routes by the URL rather than by which box it was typed into. An invite pasted
// into "Website" or "Other" still ends up private. The reverse mistake (a public link in an invite
// box) is only a validation error, so failing that way can't leak anything.
//
// Pure function, no I/O: checked by tests/unit/community-links.check.ts.

import { safeExternalUrl } from "@/lib/url-safety";

export const INVITE_PLATFORMS = ["telegram", "whatsapp", "signal", "line"] as const;
export type InvitePlatform = (typeof INVITE_PLATFORMS)[number];

export type CommunityLinkInput = {
  website?: string | null;
  newsletter?: string | null;
  instagram?: string | null;
  facebook_group?: string | null;
  facebook_page?: string | null;
  telegram_group?: string | null;
  telegram_channel?: string | null;
  whatsapp_group?: string | null;
  whatsapp_channel?: string | null;
  signal_group?: string | null;
  youtube?: string | null;
  calendar?: string | null;
  other?: string | null;
};
export type CommunityLinkField = keyof CommunityLinkInput;

export type CommunityLinkColumns = {
  website: string | null;
  newsletter: string | null;
  instagram: string | null;
  facebook_group: string | null;
  facebook_page: string | null;
  telegram_group: string | null;
  telegram_channel: string | null;
  whatsapp_channel: string | null;
  youtube: string | null;
  calendar: string | null;
  other_resource: string | null;
};

export type InviteFlags = {
  has_invites: boolean;
  has_telegram_invite: boolean;
  has_whatsapp_invite: boolean;
  has_signal_invite: boolean;
  has_line_invite: boolean;
};

export type CommunityLinkResult = {
  columns: CommunityLinkColumns;
  invites: Partial<Record<InvitePlatform, string>>;
  /** Field-level problems, keyed by the input field. Empty when the input is usable. */
  errors: Partial<Record<CommunityLinkField, string>>;
  /** Public columns filled + distinct invites. The Add form requires at least one. */
  linkCount: number;
};

// Input fields that map 1:1 onto a public column when they aren't an invite.
const PLAIN_FIELDS: Array<[CommunityLinkField, keyof CommunityLinkColumns]> = [
  ["website", "website"],
  ["newsletter", "newsletter"],
  ["instagram", "instagram"],
  ["facebook_group", "facebook_group"],
  ["facebook_page", "facebook_page"],
  ["youtube", "youtube"],
  ["calendar", "calendar"],
  ["other", "other_resource"],
];

const PLATFORM_LABEL: Record<InvitePlatform, string> = {
  telegram: "Telegram",
  whatsapp: "WhatsApp",
  signal: "Signal",
  line: "LINE",
};

function hostOf(url: URL): string {
  return url.hostname.toLowerCase().replace(/^www\./, "");
}

/** Which private-group platform this link is an invite for, or null if it isn't an invite. */
export function invitePlatformOf(raw: string): InvitePlatform | null {
  const safe = safeExternalUrl(raw);
  if (!safe) return null;
  let url: URL;
  try {
    url = new URL(safe);
  } catch {
    return null;
  }
  const host = hostOf(url);
  const path = url.pathname;
  // t.me/+abc and t.me/joinchat/abc are private-group invites; t.me/name is a public username.
  // URL parsing keeps "+" as-is in the path, so a leading "/+" is reliable here.
  if ((host === "t.me" || host === "telegram.me") && (path.startsWith("/+") || /^\/joinchat\//i.test(path))) {
    return "telegram";
  }
  if (host === "chat.whatsapp.com") return "whatsapp";
  // Every signal.group link is a group invite (the token lives in the fragment).
  if (host === "signal.group") return "signal";
  // line.me/ti/g/<token> and the older line.me/R/ti/g/<token> are group invites; line.me/R/ti/p/@x
  // (an official account page) is public.
  if (host === "line.me" && /^\/(r\/)?ti\/g\//i.test(path)) return "line";
  return null;
}

function isTelegramPublic(url: URL): boolean {
  const host = hostOf(url);
  return host === "t.me" || host === "telegram.me";
}

function isWhatsappChannel(url: URL): boolean {
  return hostOf(url) === "whatsapp.com" && /^\/channel\//i.test(url.pathname);
}

function looksLikeEmail(raw: string): boolean {
  return /^[^\s@:/]+@[^\s@:/]+\.[^\s@:/]+$/.test(raw.trim());
}

export function inviteFlags(platforms: Iterable<string>): InviteFlags {
  const set = new Set(platforms);
  return {
    has_invites: set.size > 0,
    has_telegram_invite: set.has("telegram"),
    has_whatsapp_invite: set.has("whatsapp"),
    has_signal_invite: set.has("signal"),
    has_line_invite: set.has("line"),
  };
}

export function classifyCommunityLinks(input: CommunityLinkInput): CommunityLinkResult {
  const columns: CommunityLinkColumns = {
    website: null,
    newsletter: null,
    instagram: null,
    facebook_group: null,
    facebook_page: null,
    telegram_group: null,
    telegram_channel: null,
    whatsapp_channel: null,
    youtube: null,
    calendar: null,
    other_resource: null,
  };
  const invites: Partial<Record<InvitePlatform, string>> = {};
  const errors: Partial<Record<CommunityLinkField, string>> = {};

  // Normalise + validate one field. Returns the parsed URL (and its normalised string), or null
  // after recording an error / when the field is empty.
  const read = (field: CommunityLinkField): { href: string; url: URL } | null => {
    const raw = input[field]?.trim();
    if (!raw) return null;
    if (looksLikeEmail(raw)) {
      errors[field] = "This looks like an email address. Please put it in the contact email field.";
      return null;
    }
    const href = safeExternalUrl(raw);
    if (!href) {
      errors[field] = "This doesn't look like a valid link.";
      return null;
    }
    try {
      return { href, url: new URL(href) };
    } catch {
      errors[field] = "This doesn't look like a valid link.";
      return null;
    }
  };

  // Returns true when the value was an invite (and has been taken care of, or errored).
  const takeInvite = (field: CommunityLinkField, href: string): boolean => {
    const platform = invitePlatformOf(href);
    if (!platform) return false;
    const existing = invites[platform];
    if (existing && existing !== href) {
      errors[field] = `Only one ${PLATFORM_LABEL[platform]} group invite per community, please.`;
    } else {
      invites[platform] = href;
    }
    return true;
  };

  // The dedicated messaging boxes run first, so that when two different invites for one platform
  // conflict, the one in its own box wins and the stray copy (e.g. in "Other") gets the error.

  // Telegram group / channel boxes: invite, or a public t.me/username link.
  for (const field of ["telegram_group", "telegram_channel"] as const) {
    const value = read(field);
    if (!value || takeInvite(field, value.href)) continue;
    if (!isTelegramPublic(value.url)) {
      errors[field] = "Please use a Telegram link (t.me/...).";
      continue;
    }
    columns[field] = value.href;
  }

  // WhatsApp group box: normally an invite. A channel link typed here is moved to the channel
  // column rather than rejected, since it's public anyway and the intent is clear.
  {
    const value = read("whatsapp_group");
    if (value && !takeInvite("whatsapp_group", value.href)) {
      if (isWhatsappChannel(value.url) && !input.whatsapp_channel?.trim()) {
        columns.whatsapp_channel = value.href;
      } else {
        errors.whatsapp_group = "WhatsApp group links look like chat.whatsapp.com/...";
      }
    }
  }

  // WhatsApp channel box: invite (moved to private), or a public whatsapp.com/channel/ link.
  {
    const value = read("whatsapp_channel");
    if (value && !takeInvite("whatsapp_channel", value.href)) {
      if (isWhatsappChannel(value.url)) {
        columns.whatsapp_channel = value.href;
      } else {
        errors.whatsapp_channel = "WhatsApp channel links look like whatsapp.com/channel/...";
      }
    }
  }

  // Signal group box: only invites make sense here.
  {
    const value = read("signal_group");
    if (value && !takeInvite("signal_group", value.href)) {
      errors.signal_group = "Signal group links look like signal.group/...";
    }
  }

  // Plain fields: invite-check first (privacy), otherwise the column of the same meaning.
  for (const [field, column] of PLAIN_FIELDS) {
    const value = read(field);
    if (!value || takeInvite(field, value.href)) continue;
    columns[column] = value.href;
  }

  const linkCount =
    Object.values(columns).filter((v) => v !== null).length + Object.keys(invites).length;

  return { columns, invites, errors, linkCount };
}
