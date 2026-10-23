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
} as const;

// Fallback lifetime for a snapshot whose invalidation was missed. Writes to the link tables
// (event_teachers etc.) fire no trigger yet (I-175 step 3), so until then this bounds how stale a
// list can get. Lazy: an expired entry reloads on the next read, so a quiet day costs nothing.
// Not shorter than the list pages' own 24h timer: a page takes the lowest revalidate of anything
// it reads, so 6h here turned /teachers, /venues and the sitemap into 6h pages (build, 2026-10-23).
export const SNAPSHOT_REVALIDATE_SECONDS = 24 * 60 * 60;
