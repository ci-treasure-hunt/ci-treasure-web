// Pure, client-safe event display helpers — split out of lib/events.ts (I-136) so client
// components (event cards, map, filters) don't drag the Supabase server client into their
// browser bundle just to format a date or a country name. Nothing in this file may import
// @/lib/supabase/* or touch the network — that's the whole point of the split.

export type SegmentItem = {
  title: string;
  startDate?: string;
  endDate?: string;
  teachers?: string[];
  description?: string;
};

export type SegmentsData = {
  items: SegmentItem[];
};

export type EventListItem = {
  id: string;
  shortId: string;
  slug: string;
  title: string;
  description: string | null;
  type: string;
  startDate: string;
  endDate: string;
  city: string;
  country: string;
  imageUrl: string | null;
  accentClass: string;
  lat: number | null;
  lng: number | null;
  discipline: string[];
  cancelled: boolean;
};

// Shared fallback gradient — used for event types without a dedicated accent (below),
// and as the generic hero background for entity types with no "type" taxonomy of their
// own (venues, profiles). Derived from the brand tokens (--color-ink -> --color-pine ->
// --color-sand) rather than an unrelated palette — see I-123/design.md D-02 for the trial
// and decision history.
export const GENERIC_ACCENT_GRADIENT = "bg-[linear-gradient(135deg,#1e0c30_0%,#472278_50%,#f3e8ff_100%)]";

export function getEventHref(event: Pick<EventListItem, "slug">) {
  return `/events/${event.slug}`;
}

// ISO codes where CLDR's English region name is not the form English speakers actually use or
// search for. Intl.DisplayNames returns the official short name registered with the UN, which is
// correct but sometimes uncommon: for CZ it gives "Czechia", while "Czech Republic" is both the
// higher-volume English search phrase and the form readers recognise faster.
//
// This is the single source of the country page's slug, H1, <title> and meta description
// (lib/country-pages.ts derives `slug` as slugify(getCountryLabel(iso))), so changing an entry
// here MOVES THE LIVE URL. Country pages have no previous_slugs redirect the way communities do,
// so only change one before anything links to that country, or add a redirect alongside.
// Note this is not lib/countries.ts — that list only feeds the admin country-picker dropdown.
const COUNTRY_LABEL_OVERRIDES: Record<string, string> = {
  CZ: "Czech Republic",
};

export function getCountryLabel(country: string) {
  if (/^[A-Z]{2}$/.test(country)) {
    const override = COUNTRY_LABEL_OVERRIDES[country];
    if (override) return override;
    try {
      return new Intl.DisplayNames(["en"], { type: "region" }).of(country) ?? country;
    } catch {
      return country;
    }
  }
  return country;
}

// ISO codes whose English name takes a definite article ("the United Kingdom", "the
// Netherlands") — only relevant when the label is embedded in a sentence (e.g. "Upcoming
// events in {label}"). "City, Country" style display never needs this.
const COUNTRIES_WITH_ARTICLE = new Set([
  "GB", // the United Kingdom
  "US", // the United States
  "AE", // the United Arab Emirates
  "NL", // the Netherlands
  "PH", // the Philippines
  "BS", // the Bahamas
  "GM", // the Gambia
  "CZ", // the Czech Republic (needed once CZ was overridden away from "Czechia" above)
  "DO", // the Dominican Republic
  "MV", // the Maldives
  "KM", // the Comoros
]);

export function getCountryLabelWithArticle(country: string) {
  const label = getCountryLabel(country);
  return COUNTRIES_WITH_ARTICLE.has(country.toUpperCase()) ? `the ${label}` : label;
}

export function getTypeLabel(type: string) {
  const labels: Record<string, string> = {
    camp: "Camp",
    festival: "Festival",
    intensive: "Intensive",
    long_jam: "Long Jam",
    residency: "Residency",
    retreat: "Retreat",
    training: "Training",
    workshop: "Workshop",
  };
  return labels[type] ?? type;
}

// Meta-description fallback for events with no description of their own. The base fact alone is
// too short for Ahrefs' ~110-char floor across all realistic city/country lengths, so two filler
// sentences are appended one at a time, each only kept whole if it fits under the 160-char cap —
// never trimmed mid-sentence, which would leave a dangling clause like "the Contact Improvisation."
export function buildEventFallbackDescription(type: string, city: string, country: string) {
  const base = `A Contact Improvisation ${getTypeLabel(type).toLowerCase()} in ${city}, ${country}.`;
  const sentence1 = " Find dates, location, and event details on CI Treasure Hunt.";
  const sentence2 = " The Contact Improvisation events directory.";
  let text = base + sentence1;
  if ((text + sentence2).length <= 160) text += sentence2;
  return text;
}

// Meta-description padding for entities with real but short (< ~110 char) content of their own
// (a community's one-line note, a teacher's short bio). The original text is never altered or
// truncated — only appended to. Bug found via Ahrefs re-crawl 2026-08-11: dropping sentence2
// outright whenever it didn't fit could leave the result still under `min` (e.g. a 90-char base +
// sentence1 alone landing at ~99 chars) — now trimmed to fit at a word boundary instead of
// skipped, so the floor is always met when the combined text is long enough to reach it.
export function padShortDescription(text: string, subject: string, min = 110, max = 160) {
  const trimmed = text.trim();
  const base = /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
  if (base.length >= min) return base.slice(0, max);
  const sentence1 = " Listed on CI Treasure Hunt.";
  const withSentence1 = base + sentence1;
  const sentence2 = ` The global directory of Contact Improvisation ${subject} worldwide.`;
  const full = withSentence1 + sentence2;
  if (full.length <= max) return full;
  if (withSentence1.length >= min) return withSentence1;
  let trimmedFull = full.slice(0, max);
  trimmedFull = trimmedFull.slice(0, trimmedFull.lastIndexOf(" ")).trimEnd();
  if (!/[.!?]$/.test(trimmedFull)) trimmedFull += ".";
  return trimmedFull;
}

// Acronyms that shouldn't be title-cased word-by-word. Add here as new short-form
// practices appear — everything else humanizes automatically (snake_case -> Title Case).
// Shared between the homepage practice filter and the organizer submission form.
const DISCIPLINE_LABEL_OVERRIDES: Record<string, string> = {
  bmc: "BMC",
};

export function disciplineLabel(value: string): string {
  return (
    DISCIPLINE_LABEL_OVERRIDES[value] ??
    value
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ")
  );
}

export function getEventLocation(event: Pick<EventListItem, "city" | "country">) {
  return `${event.city}, ${getCountryLabel(event.country)}`;
}

export function formatEventDateRange(event: Pick<EventListItem, "startDate" | "endDate">) {
  const start = new Date(`${event.startDate}T12:00:00`);
  const end = new Date(`${event.endDate}T12:00:00`);
  const sameDay = event.startDate === event.endDate;
  const sameYear = start.getFullYear() === end.getFullYear();

  if (sameDay) {
    return new Intl.DateTimeFormat("en", {
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(start);
  }

  if (sameYear) {
    return `${new Intl.DateTimeFormat("en", {
      month: "short",
      day: "numeric",
    }).format(start)} - ${new Intl.DateTimeFormat("en", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(end)}`;
  }

  return `${new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(start)} - ${new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(end)}`;
}
