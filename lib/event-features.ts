// I-184: the fixed vocabulary for events.features and events.accommodation_type. This list is
// the single source for the organizer form, the event page and the save-time cleanup. Until
// 2026-10 features was free text that nothing displayed, and it filled up with practices, event
// types and place names (77 distinct values on published events). No DB enum or CHECK
// constraint on purpose: every write goes through our own code, and a constraint would turn each
// vocabulary change into a migration in this public repo. Adding a value is one line here.
//
// Labels are American English, like all site text.

export type FeatureGroup = "stay" | "program" | "access" | "audience";

export const FEATURE_GROUPS: ReadonlyArray<{ id: FeatureGroup; label: string }> = [
  { id: "stay", label: "Stay & setting" },
  { id: "program", label: "Program" },
  { id: "access", label: "Access" },
  { id: "audience", label: "Who it's for" },
];

export type EventFeature = {
  slug: string;
  label: string;
  group: FeatureGroup;
  // Shown as a tooltip in the form and on the event page, for labels that don't explain
  // themselves.
  hint?: string;
};

export const EVENT_FEATURES: ReadonlyArray<EventFeature> = [
  { slug: "residential", label: "Residential", group: "stay", hint: "Participants sleep on site, together" },
  // Not "Meals included": meals are sometimes a paid add-on. The price list says which.
  { slug: "meals", label: "Meals provided", group: "stay" },
  { slug: "sauna", label: "Sauna", group: "stay" },
  { slug: "swimming_pool", label: "Swimming pool", group: "stay" },
  // Setting values are independent: a city can be by the sea or in the mountains.
  { slug: "nature", label: "In nature", group: "stay" },
  { slug: "by_the_sea", label: "By the sea", group: "stay" },
  { slug: "mountains", label: "Mountains", group: "stay" },

  // An extra on top of the event's type, so never kept on a jam or long jam (see sanitizeFeatures).
  { slug: "jams", label: "Jams", group: "program" },
  { slug: "silent_jam", label: "Silent jam", group: "program", hint: "A jam without music" },
  { slug: "live_music", label: "Live music", group: "program" },
  { slug: "self_organized", label: "Self-organized", group: "program", hint: "No teachers, everyone co-creates" },
  { slug: "outdoor_dancing", label: "Outdoor dancing", group: "program" },
  { slug: "hiking", label: "Hiking", group: "program" },
  { slug: "site_specific", label: "Site-specific dance", group: "program" },
  { slug: "labs", label: "Research labs", group: "program" },
  // Named scores and methods: features, not practices (too small for the practice filter).
  { slug: "underscore", label: "Underscore", group: "program", hint: "Nancy Stark Smith's score" },
  { slug: "contemplative_dance", label: "Contemplative Dance Practice", group: "program", hint: "Barbara Dilley's form (CDP)" },
  { slug: "ensemble_thinking", label: "Ensemble Thinking", group: "program", hint: "Nina Martin's method" },
  { slug: "performance", label: "Performance", group: "program" },
  { slug: "talks", label: "Talks & discussions", group: "program" },
  { slug: "film_screenings", label: "Film screenings", group: "program" },
  { slug: "meditation", label: "Meditation", group: "program" },
  // CI in water, distinct from the aquatic_bodywork practice.
  { slug: "water_practice", label: "Water practice", group: "program", hint: "Contact Improvisation in water" },
  { slug: "silence", label: "Times of silence", group: "program", hint: "No talking, from silent mornings to a silent retreat" },
  // Most "training" events are programs for dancers; this marks the ones that qualify you to teach.
  { slug: "teacher_training", label: "Teacher training", group: "program", hint: "Qualifies you to teach" },

  { slug: "sliding_scale", label: "Sliding scale", group: "access" },
  { slug: "work_exchange", label: "Work exchange", group: "access" },
  { slug: "scholarships", label: "Scholarships / reduced places", group: "access" },

  { slug: "family_friendly", label: "Family friendly", group: "audience", hint: "Children welcome" },
  { slug: "childcare", label: "Childcare", group: "audience", hint: "Childcare offered, so parents can take part" },
  {
    slug: "flinta",
    label: "FLINTA*",
    group: "audience",
    hint: "Women, lesbian, intersex, non-binary, trans and agender people: the whole event or a dedicated space within it",
  },
  { slug: "mixed_abilities", label: "Mixed abilities", group: "audience", hint: "Dancers with and without disabilities" },
];

// Where people sleep. Only kept on a residential event (see sanitizeAccommodation).
export const ACCOMMODATION_TYPES: ReadonlyArray<{ slug: string; label: string }> = [
  { slug: "camping", label: "Camping" },
  { slug: "dormitory", label: "Dormitory" },
  { slug: "shared_room", label: "Shared room" },
  { slug: "private_room", label: "Private room" },
  { slug: "floor_space", label: "Floor space" },
  { slug: "yurt", label: "Yurt" },
];

const FEATURE_ORDER = new Map(EVENT_FEATURES.map((f, i) => [f.slug, i]));
const FEATURE_BY_SLUG = new Map(EVENT_FEATURES.map((f) => [f.slug, f]));
const ACCOMMODATION_ORDER = new Map(ACCOMMODATION_TYPES.map((a, i) => [a.slug, i]));
const ACCOMMODATION_LABELS = new Map(ACCOMMODATION_TYPES.map((a) => [a.slug, a.label]));

const JAM_TYPES = new Set(["jam", "long_jam"]);

export function getFeature(slug: string): EventFeature | null {
  return FEATURE_BY_SLUG.get(slug) ?? null;
}

export function accommodationLabel(slug: string): string | null {
  return ACCOMMODATION_LABELS.get(slug) ?? null;
}

// Save-time cleanup, shared by the organizer form and series copies: keeps known values only,
// in list order, without duplicates. "jams" is dropped on a jam or long jam, where it would only
// repeat the type. Empty → null, so the column stays NULL rather than [].
export function sanitizeFeatures(values: readonly string[] | null | undefined, type: string | null | undefined): string[] | null {
  const kept = [...new Set(values ?? [])]
    .filter((v) => FEATURE_ORDER.has(v))
    .filter((v) => !(v === "jams" && type && JAM_TYPES.has(type)))
    .sort((a, b) => FEATURE_ORDER.get(a)! - FEATURE_ORDER.get(b)!);
  return kept.length ? kept : null;
}

// Room types only mean something when people stay on site: unticking "Residential" clears them.
export function sanitizeAccommodation(
  values: readonly string[] | null | undefined,
  features: readonly string[] | null | undefined,
): string[] | null {
  if (!features?.includes("residential")) return null;
  const kept = [...new Set(values ?? [])]
    .filter((v) => ACCOMMODATION_ORDER.has(v))
    .sort((a, b) => ACCOMMODATION_ORDER.get(a)! - ACCOMMODATION_ORDER.get(b)!);
  return kept.length ? kept : null;
}
