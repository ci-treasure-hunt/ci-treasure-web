// I-111: shared shapes + option lists for the community admin editor (and, later, the public Add
// form). Option lists come from the live data on 2026-09-22; see the I-111 spec's "Build spec,
// Stage 1" for which values the public form offers and which are admin-only.

export const COMMUNITY_TYPES = [
  "General CI Community",
  "Jam Series",
  "Festival",
  "Collective",
  "Other",
  // Admin-only: a one-person practice belongs on a profile (headcount rule), so the public form
  // doesn't offer this. Kept for the remaining held/legacy rows.
  "Teacher Network or Channel",
] as const;

export const ACTIVITY_LEVELS = [
  "Active daily",
  "Weekly or monthly",
  "Seasonal",
  "Several times a year",
  // Admin-only on the public form.
  "Inactive",
  "Overview / aggregator",
] as const;

export const FOCUS_OPTIONS = ["Jams", "Classes", "Workshops", "Festivals", "Other"] as const;

export const FRIENDLINESS_OPTIONS = ["Open for collaboration", "Neutral"] as const;

// Most-used first (the public form shows these as quick picks); the rest follow alphabetically.
export const LANGUAGE_OPTIONS = [
  "English", "Spanish", "German", "French", "Italian", "Portuguese", "Russian", "Dutch",
  "Bulgarian", "Cantonese", "Catalan", "Croatian", "Czech", "Danish", "Estonian", "Finnish",
  "Galician", "Greek", "Hebrew", "Hungarian", "Japanese", "Latvian", "Lithuanian", "Mandarin",
  "Norwegian", "Polish", "Romanian", "Serbian", "Slovak", "Slovene", "Swedish", "Thai", "Turkish",
  "Ukrainian", "Vietnamese",
] as const;

export const COMMUNITY_STATUSES = ["published", "pending", "rejected"] as const;
export type CommunityStatus = (typeof COMMUNITY_STATUSES)[number];

export type AdminCommunityInvite = {
  platform: string;
  url: string;
  published: boolean;
  /** Admin ticked "remove". */
  remove: boolean;
};

export type AdminCommunityFormData = {
  id: string | null;
  name: string;
  slug: string;
  type: string;
  status: CommunityStatus;
  activityLevel: string;
  focus: string[];
  /** Comma-separated in the form, text[] in the DB. */
  languages: string;
  description: string;

  worldwide: boolean;
  city: string;
  country: string;
  /** Empty = derive from country on save. */
  region: string;
  addressForMap: string;
  lat: string;
  lng: string;

  // Link boxes, run through classifyCommunityLinks on save.
  website: string;
  newsletter: string;
  instagram: string;
  facebookGroup: string;
  facebookPage: string;
  telegramGroup: string;
  telegramChannel: string;
  whatsappGroup: string;
  whatsappChannel: string;
  signalGroup: string;
  youtube: string;
  calendar: string;
  other: string;
  invites: AdminCommunityInvite[];

  email: string;
  contactPerson: string;
  submitterContact: string;

  audienceSize: string;
  friendliness: string;
  lastVerified: string;
  adminNotes: string;
  deletedAt: string | null;
};

export function createEmptyCommunityFormData(): AdminCommunityFormData {
  return {
    id: null,
    name: "",
    slug: "",
    type: "General CI Community",
    status: "published",
    activityLevel: "",
    focus: [],
    languages: "",
    description: "",
    worldwide: false,
    city: "",
    country: "",
    region: "",
    addressForMap: "",
    lat: "",
    lng: "",
    website: "",
    newsletter: "",
    instagram: "",
    facebookGroup: "",
    facebookPage: "",
    telegramGroup: "",
    telegramChannel: "",
    whatsappGroup: "",
    whatsappChannel: "",
    signalGroup: "",
    youtube: "",
    calendar: "",
    other: "",
    invites: [],
    email: "",
    contactPerson: "",
    submitterContact: "",
    audienceSize: "",
    friendliness: "",
    lastVerified: "",
    adminNotes: "",
    deletedAt: null,
  };
}

/** "English, German ,, french" → ["English", "German", "French"] (known casing where possible). */
export function parseLanguages(value: string): string[] {
  const known = new Map<string, string>(LANGUAGE_OPTIONS.map((l) => [l.toLowerCase(), l]));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of value.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const canonical = known.get(trimmed.toLowerCase()) ?? trimmed;
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    out.push(canonical);
  }
  return out;
}
