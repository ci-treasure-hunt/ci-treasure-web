// I-175: data-cache tags for the whole-list snapshots (unstable_cache), one per entity type.
// Kept in its own dependency-free module so the revalidate webhook can import the names without
// pulling in a Supabase client.
//
// The snapshots serve the list pages, country pages and the MCP searches. Detail pages must NOT
// read them: a page that reads tagged data inherits the tag (verified on 16.4.2, 2026-10-23), so
// every write of that type (~50 a day) would re-render every detail page; and revalidatePath on a
// page makes every unstable_cache read in its next render refetch, so each per-slug page refresh
// would also reload the whole list. Detail pages get their own per-slug cached fetchers instead.
export const CACHE_TAGS = {
  events: "events",
  profiles: "profiles",
  venues: "venues",
  communities: "communities",
  // Which countries have a /[country] page; read by every detail page for its country link.
  countrySummaries: "country_summaries",
} as const;

// I-175 step 4: per-entity tags for the detail fetchers. A detail page inherits only its own
// entity's tag, so an edit re-renders the pages that show that entity and nothing else. The
// webhook revalidates the page paths too; the tag is what reaches the MCP get_* tools, which read
// the same cached fetcher from a route handler that has no page path to revalidate.
export const eventTag = (shortId: string) => `event:${shortId}`;

// Fallback lifetime for the data the detail pages read (per-event entry, country-page list).
// I-175 step 5: 7 days, matching the four detail routes' own timer and the root layout's (a page
// takes the lowest revalidate of anything it reads, layout included). Edits reach the pages through
// the revalidate webhook; the timer only catches a missed invalidation, and each timer rebuild of a
// page a crawler revisits cost CPU, ISR writes and Supabase egress (~12K ISR write units a day at
// 24h, 2026-11-05/06). Date-driven states are covered by the nightly jobs (archive-past-events,
// revalidate-started-class-series).
export const DETAIL_REVALIDATE_SECONDS = 7 * 24 * 60 * 60;

// Fallback lifetime for a snapshot whose invalidation was missed. Writes to the link tables
// (event_teachers etc.) fire no trigger yet (I-175 step 3), so until then this bounds how stale a
// list can get. Lazy: an expired entry reloads on the next read, so a quiet day costs nothing.
// Not shorter than the list pages' own 24h timer: a page takes the lowest revalidate of anything
// it reads, so 6h here turned /teachers, /venues and the sitemap into 6h pages (build, 2026-10-23).
export const SNAPSHOT_REVALIDATE_SECONDS = 24 * 60 * 60;
