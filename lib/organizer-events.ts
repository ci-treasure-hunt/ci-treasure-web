// Shared types + pure helpers for the organizer-facing event form (/events/new,
// /events/[slug]/edit). Reuses the admin item shapes but is intentionally a smaller
// field set — no status/hide/cancelled/organizer-linking controls (those stay admin-only).
// Teacher-linking is the one exception: create mode collects it locally (see
// OrganizerTeacherItem) since organizers otherwise had no way to add a teacher until after
// their event already existed (found live 2026-07-22).

import type { AdminLinkItem, AdminPriceItem } from "./admin-events";
import { COUNTRIES } from "./countries";
import { safeExternalUrl } from "./url-safety";

export { EVENT_TYPE_OPTIONS, LINK_TYPE_OPTIONS, TEACHER_ROLE_OPTIONS } from "./admin-events";
export type { AdminLinkItem, AdminPriceItem };

export type OrganizerTeacherItem = {
  profileId: string;
  name: string;
  role: string;
};

// Level is a free-text column. Canonical set (unified 2026-07-03): "all_levels" is the
// single "everyone welcome" value; open_level/mixed/intermediate_plus were migrated away.
export const LEVEL_OPTIONS = ["", "all_levels", "beginner", "intermediate", "advanced"] as const;

// Multi-select checkboxes (like discipline) instead of a free-text "en, de" field — the free-text
// version silently stored whatever the organizer typed ("English") instead of an ISO code, only
// caught downstream by a name→code guess-map. A closed list removes the guessing entirely. Covers
// the languages that actually recur across current events/organizers (checked live 2026-08-18);
// "Other" keeps a free-text escape hatch rather than blocking a genuine gap.
export const LANGUAGE_OPTIONS = [
  { code: "en", label: "English" },
  { code: "de", label: "German" },
  { code: "fr", label: "French" },
  { code: "es", label: "Spanish" },
  { code: "it", label: "Italian" },
  { code: "pt", label: "Portuguese" },
  { code: "pl", label: "Polish" },
  { code: "cs", label: "Czech" },
  { code: "nl", label: "Dutch" },
  { code: "he", label: "Hebrew" },
  { code: "da", label: "Danish" },
  { code: "hu", label: "Hungarian" },
  { code: "sv", label: "Swedish" },
] as const;

const KNOWN_LANGUAGE_CODES: Set<string> = new Set(LANGUAGE_OPTIONS.map((l) => l.code));

// Global timezone coverage, roughly ordered west→east, with Europe first (CI events
// skew European). The form shows each zone's live UTC offset and keeps the event's
// current value even if it's not listed, so edits never drop it. IANA names are stored
// (DST-aware) — a bare "GMT+6" would be wrong half the year.
export const TIMEZONE_OPTIONS = [
  // Europe
  "Europe/London",
  "Europe/Lisbon",
  "Europe/Berlin",
  "Europe/Paris",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Amsterdam",
  "Europe/Zurich",
  "Europe/Vienna",
  "Europe/Prague",
  "Europe/Warsaw",
  "Europe/Athens",
  "Europe/Stockholm",
  "Europe/Helsinki",
  "Europe/Bucharest",
  "Europe/Istanbul",
  "Europe/Moscow",
  // Americas
  "America/Sao_Paulo",
  "America/Argentina/Buenos_Aires",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Mexico_City",
  "America/Bogota",
  "America/Toronto",
  // Africa & Middle East
  "Africa/Casablanca",
  "Africa/Lagos",
  "Africa/Cairo",
  "Africa/Johannesburg",
  "Asia/Jerusalem",
  "Asia/Dubai",
  // Asia
  "Asia/Kolkata",
  "Asia/Kathmandu",
  "Asia/Dhaka",
  "Asia/Bangkok",
  "Asia/Shanghai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Asia/Seoul",
  // Oceania & Pacific
  "Australia/Perth",
  "Australia/Sydney",
  "Pacific/Auckland",
  "Pacific/Honolulu",
] as const;

export type OrganizerEventFormData = {
  title: string;
  type: string;
  startDate: string;
  endDate: string;
  timezone: string;
  city: string;
  country: string;
  venueId: string | null;
  venueLabel: string;
  venueName: string;
  contactEmail: string;
  description: string;
  imageUrl: string;
  level: string;
  // Closed multi-select against LANGUAGE_OPTIONS, plus a free-text escape hatch for anything
  // not in that list (e.g. a language that hasn't come up in the DB yet).
  languages: string[];
  languagesOther: string;
  features: string;
  // Multi-select checkboxes against known values only — no free text, so the
  // taxonomy only grows through admin/addevent-vetted additions (2026-07-05 decision).
  discipline: string[];
  cancelled: boolean;
  cancelledText: string;
  priceItems: AdminPriceItem[];
  linkItems: AdminLinkItem[];
  // Create mode only — edit mode manages this live via TeacherManager, which needs a real
  // event id that doesn't exist yet at this point. Always empty when hydrated from an
  // existing event (see eventRowToFormData); createEvent is the only consumer.
  teachers: OrganizerTeacherItem[];
};

export function createEmptyOrganizerEventFormData(): OrganizerEventFormData {
  return {
    title: "",
    type: "workshop",
    startDate: "",
    endDate: "",
    timezone: "", // no default — see the blank <option> in event-form.tsx for why
    city: "",
    country: "",
    venueId: null,
    venueLabel: "",
    venueName: "",
    contactEmail: "",
    description: "",
    imageUrl: "",
    level: "",
    languages: [],
    languagesOther: "",
    features: "",
    teachers: [],
    discipline: ["contact_improvisation"],
    cancelled: false,
    cancelledText: "",
    priceItems: [],
    linkItems: [],
  };
}

// ── Parsing (form → DB) ────────────────────────────────────────────────────

// All currencies are stored ×100 (minor units); the display layer divides by 100.
//
// No "|| EUR" fallback on a missing currency (removed 2026-08-18) — that silently mislabeled
// every price as EUR whenever the currency picker was left untouched, which happened across 4
// real submissions (all DKK/HUF events saved as EUR). A row with an amount but no currency is
// dropped rather than guessed: a visibly missing price tier gets noticed and fixed on the event
// page; a wrong-but-plausible-looking currency does not.
export function parsePriceItems(items: AdminPriceItem[]) {
  return items
    // A row with an amount but no currency is the broken middle case (see comment above) —
    // drop it before mapping rather than guess a currency for it.
    .filter((item) => !(item.amount.trim() && !item.currency.trim()))
    .map((item) => {
      const amount = item.amount.trim();
      const currency = item.currency.trim();
      const hasValidAmount = Boolean(amount) && Boolean(currency);
      return {
        amount: hasValidAmount ? Math.round(Number.parseFloat(amount) * 100) : null,
        currency: hasValidAmount ? currency : undefined,
        description: item.description.trim() || undefined,
      };
    })
    .filter((item) => item.amount !== null || item.description);
}

// A bare email address ("cicopenhagen@gmail.com") typed into the URL field — found live
// 2026-08-18, 3 of 4 submissions from one organizer put contact_email's value here too, since
// the field is a plain text input with no format hint beyond a placeholder.
//
// First fix (same day) auto-prefixed "mailto:" so it wasn't a dead link — wrong: `links` is
// rendered as a plain, public <a> tag, while contact_email is Turnstile-gated + rate-limited
// (lib/protected-email-action.ts, email_reveal_log). Silently promoting a bare email into
// `links` would ship it unprotected, defeating the exact scraping protection that field exists
// for. extractBareEmailFromLinks() in actions.ts pulls it out and routes it to contact_email
// instead — parseLinkItems just drops what's left behind (never stores an email as a link).
export const BARE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseLinkItems(items: AdminLinkItem[]) {
  return items
    .map((item) => ({ type: item.type.trim() || "website", url: item.url.trim() }))
    .filter((item) => item.url && !BARE_EMAIL.test(item.url))
    // I-165: scheme allowlist, http/https only. Runs after the BARE_EMAIL filter above so a bare
    // address is still routed to contact_email by extractBareEmailFromLinks rather than being
    // dropped here as an unparseable link.
    .map((item) => ({ ...item, url: safeExternalUrl(item.url) }))
    .filter((item): item is { type: string; url: string } => item.url !== null);
}

export function normalizeJsonItems<T>(items: T[]) {
  return items.length ? { items } : null;
}

// "en, de" → ["en","de"]; empty → null (so the column stays NULL, not []).
export function parseCsvArray(value: string): string[] | null {
  const parts = value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length ? parts : null;
}

// languages is already ISO codes from the checkbox picker (LANGUAGE_OPTIONS) — this just merges
// in the free-text "Other" field, comma-split and lowercased, without re-guessing anything the
// picker already got right. Replaces the earlier name→code guess-map approach (2026-08-18):
// organizers typed full names ("English") into a free-text field despite the "en, de"
// placeholder, so the closed picker removes the guessing rather than papering over it.
export function parseLanguages(codes: string[], other: string): string[] | null {
  const extra = other
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const parts = [...new Set([...codes, ...extra])];
  return parts.length ? parts : null;
}

// ── Prefill (DB → form) ────────────────────────────────────────────────────

type EventRowForForm = {
  title: string;
  type: string;
  start_date: string | null;
  end_date: string | null;
  timezone: string | null;
  city: string | null;
  country: string | null;
  address: { venue_name?: string } | null;
  contact_email: string | null;
  venue_id: string | null;
  venues: { id: string; name: string; city: string; country: string } | null;
  description: string | null;
  image_url: string | null;
  level: string | null;
  language: string[] | null;
  features: string[] | null;
  discipline: string[] | null;
  cancelled: boolean | null;
  cancelled_text: string | null;
  price: { items?: Array<{ amount?: number | null; currency?: string; description?: string }> } | null;
  links: { items?: Array<{ type?: string; url?: string }> } | null;
};

export function eventRowToFormData(row: EventRowForForm): OrganizerEventFormData {
  return {
    title: row.title ?? "",
    type: row.type ?? "workshop",
    startDate: row.start_date ?? "",
    endDate: row.end_date ?? "",
    timezone: row.timezone ?? "Europe/Berlin",
    city: row.city ?? "",
    country: row.country ?? "",
    venueId: row.venue_id ?? null,
    venueLabel: row.venues ? `${row.venues.name} — ${row.venues.city}, ${row.venues.country}` : "",
    venueName: row.address?.venue_name ?? "",
    contactEmail: row.contact_email ?? "",
    description: row.description ?? "",
    imageUrl: row.image_url ?? "",
    level: row.level ?? "",
    languages: (row.language ?? []).filter((l) => KNOWN_LANGUAGE_CODES.has(l)),
    languagesOther: (row.language ?? []).filter((l) => !KNOWN_LANGUAGE_CODES.has(l)).join(", "),
    features: (row.features ?? []).join(", "),
    // Defensive fallback only — every real event has discipline set since the 2026-07-04
    // cleanup; a NULL here would mean a new insert path forgot to set it.
    discipline: row.discipline?.length ? row.discipline : ["contact_improvisation"],
    cancelled: row.cancelled ?? false,
    cancelledText: row.cancelled_text ?? "",
    priceItems: (row.price?.items ?? []).map((p) => ({
      // Stored minor units → back to major units for editing.
      amount: p.amount != null ? String(p.amount / 100) : "",
      currency: p.currency ?? "EUR",
      description: p.description ?? "",
    })),
    linkItems: (row.links?.items ?? []).map((l) => ({
      type: l.type ?? "website",
      url: l.url ?? "",
    })),
    // Edit mode manages teachers live via TeacherManager, not this field — see its comment
    // on OrganizerEventFormData.
    teachers: [],
  };
}

// Validation shared by create + edit. `enforceMinDuration` is only passed true from
// createEvent — single-day jams/classes are blocked at submission time (2026-07-05
// decision) because neither the organizer nor admin web forms capture start/end time
// of day yet, and a single-day listing without a time is barely usable. Editing an
// existing event never re-checks this, so already-linked single-day events (added via
// /addevent or admin, which do capture time) stay editable.
export function validateOrganizerEvent(
  data: OrganizerEventFormData,
  options?: { enforceMinDuration?: boolean }
): string | null {
  if (!data.title.trim()) return "Title is required.";
  if (!data.startDate) return "Start date is required.";
  if (!data.endDate) return "End date is required.";
  if (data.endDate < data.startDate) return "End date can't be before the start date.";
  if (options?.enforceMinDuration && data.endDate === data.startDate) {
    return "Self-service submission currently requires events spanning 2+ days. For single-day jams, classes, or workshops, please share it in our Telegram group and we'll add it manually.";
  }
  if (!data.city.trim()) return "City is required.";
  if (!data.country.trim()) return "Country is required.";
  // Found live 2026-07-22: the old free-text "2-letter code" field let "UK" (not a real ISO
  // code — "GB" is) straight through, since it happens to match the length check. The form
  // now uses a country-name dropdown, but validate against the real list here too in case the
  // API route is ever hit directly.
  if (!COUNTRIES.some((c) => c.code === data.country.trim().toUpperCase())) {
    return "Select a valid country from the list.";
  }
  // Timezone itself is no longer required here — createEvent/updateEvent auto-derive it
  // from the resolved lat/lng (tz-lookup) when the organizer leaves it blank, and only
  // fall back to asking if geocoding also failed. See actions.ts.
  if (!data.discipline || data.discipline.length === 0) {
    return "Select at least one practice.";
  }
  // Found live 2026-07-22: "Pound"/"pounds" typed into the free-text currency field crashed
  // both the event page and the announce Edge Functions (Intl.NumberFormat throws on a
  // non-ISO-4217 string) — catch it here instead, before it reaches the database.
  for (const item of data.priceItems ?? []) {
    if (!item.currency.trim()) continue;
    try {
      new Intl.NumberFormat("en", { style: "currency", currency: item.currency.trim() });
    } catch {
      return `"${item.currency}" isn't a valid currency code — use the 3-letter ISO code instead (e.g. GBP, EUR, USD).`;
    }
  }
  return null;
}

// Normalize a 2-letter country code to uppercase for storage.
export function normalizeCountry(value: string) {
  return value.trim().toUpperCase();
}
