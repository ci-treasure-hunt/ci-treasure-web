// Single source of truth for the medium/small-file naming convention (I-129).
// Every upload path (upload-action.ts, rehost-image.ts, photo-actions.ts, plus
// the Python enrichment scripts' medium_object_path()/small_object_path())
// and every read path (event-card.tsx, VenueCard) must go through these —
// never re-derive the suffix inline, or write and read can drift apart.
//
// No DB column for either: both are a pure function of image_url, and every
// upload path is required to write all three files together (see the I-129
// spec for why a `thumb_url`-style column was considered and rejected).
//
// Phase 2 (I-129): renamed from `thumb` -> `medium` and converted to WebP —
// "thumbnail" conventionally means the smallest tier, which stopped being
// true once `small` was added below it. `large` (the base image_url file)
// stays JPEG unconditionally — it's the only size ever referenced by
// og:image/JSON-LD, and Telegram's link-preview unfurler doesn't reliably
// render WebP, so `medium`/`small` (pure in-page <img> uses, never
// link-preview-scraped) are the only sizes safe to convert.
export function getMediumUrl(imageUrl: string): string {
  return imageUrl.replace(/\.[a-zA-Z0-9]+$/, "-medium.webp");
}

export function getSmallUrl(imageUrl: string): string {
  return imageUrl.replace(/\.[a-zA-Z0-9]+$/, "-small.webp");
}

const SUPABASE_STORAGE_ORIGIN = "https://ormttcjjsumbmvyennfx.supabase.co/storage/v1/object/public/";
const CDN_ORIGIN = "https://cdn.citreasurehunt.com/storage/v1/object/public/";

// Rewrites a Supabase Storage URL to the Cloudflare Worker CDN in front of it (see
// infra-reference.md, "Storage CDN") — every repeat visitor is served from Cloudflare's edge
// instead of Supabase, which is what the cached-egress quota is billed on. Display/read call
// sites only: getMediumUrl/getSmallUrl above are also used to derive upload paths (write side),
// where this rewrite must never be applied, so it lives one layer up instead of inside them.
// No-ops on anything that isn't a Supabase Storage URL.
export function toCdnUrl(url: string): string {
  return url.startsWith(SUPABASE_STORAGE_ORIGIN)
    ? CDN_ORIGIN + url.slice(SUPABASE_STORAGE_ORIGIN.length)
    : url;
}
