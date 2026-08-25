// Canonical controlled vocabulary of practices a teacher can self-select (I-135).
//
// This is the self-select TIER only. The full vocabulary (this tier plus curated-data-only
// practices like yoga/acroyoga/capoeira/feldenkrais/breathwork), the self-select-vs-curated
// distinction, and the tagging criteria used during backfill all live in the canonical reference:
// ci-treasure-hunt/docs/web/practice-tags.md. Keep that file in sync with this constant -- it's a
// cross-repo doc, and cross-repo doc references have drifted silently before (see the LINK_TYPES.md
// path fix in admin-events.ts, 2026-08-24).
//
// Deliberately a curated constant, NOT derived from live event data: this is the one place a
// teacher writes their own tags, so the list defines what CITH is about. It's limited to
// contact improvisation and genuinely CI-adjacent movement-research practices (shared lineage /
// shared practitioners). Expansion is an admin decision — add a slug here, never let users type
// free text (that's how `bmc`/`body-mind centering` and `ashtanga`/`hatha`/`hathayoga` chaos and
// self-marketing creep in).
//
// Deliberately EXCLUDED from self-select, and why:
// - `yoga`, `acroyoga`, `capoeira`, `feldenkrais`, `alexander_technique`, `aquatic_bodywork`,
//   `contactango`, `breathwork` — separate domains, not CI-adjacent movement research. Adding
//   them to the self-select is the first step toward broad-wellness scope drift (the direction
//   CITH deliberately avoids). They can still be recorded as accurate column *data* via curated
//   admin/enrichment backfill (I-135's picker-vs-data distinction) — they're just not
//   self-claimable until there's a deliberate decision to broaden `/teachers` beyond CI.
//
// Display labels come from `disciplineLabel()` (lib/event-display.ts), which already carries the
// `bmc → "BMC"` override — so this list is slugs only, one canonical slug per practice.
//
// NOTE: the event submission form still derives its own practice options from live event data
// (`getEventDisciplines`). This constant is the intended single source of truth for both; migrating
// the event form onto it is a follow-up consistency task, not done here to keep this change scoped.
export const SELF_SELECTABLE_PRACTICES = [
  "contact_improvisation",
  "somatic_movement",
  "dance_improvisation",
  "bmc",
  "authentic_movement",
  "contemporary_dance",
  "axis_syllabus",
  "butoh",
  "conscious_dance",
] as const;

export type SelfSelectablePractice = (typeof SELF_SELECTABLE_PRACTICES)[number];

export function isSelfSelectablePractice(value: string): value is SelfSelectablePractice {
  return (SELF_SELECTABLE_PRACTICES as readonly string[]).includes(value);
}
