import { unstable_cache } from "next/cache";
import { toCdnUrl } from "@/lib/image-url";
import { SITE_OG_IMAGE } from "@/lib/site";
import { assertPublicUrl } from "@/lib/rehost-image";

// Facebook's crawler (unlike Telegram's, which just probes the image directly) wants explicit
// og:image:width/height/type to reliably render a preview — the homepage gets these for free from
// Next's automatic file-based opengraph-image.jpg convention, but generateMetadata pages (this
// fallback) don't, since specifying the URL manually bypasses that. Dimensions are of the static
// fallback file itself (app/opengraph-image.jpg, confirmed via `file`: 1280x1024 JPEG) — only
// valid when actually falling back to it, not when an entity has its own photo of unknown size.
//
// Entity photos (event/teacher/venue) are resized to a 1600px *long edge* (I-129), so aspect
// ratio — and therefore exact width/height — varies per image and isn't stored in the DB. Ahrefs
// flags any og:image missing width/height/type as "incomplete" (I-150), so this probes the actual
// file via `sharp`. Falls back to a bare `{ url }` if the probe fails for any reason — a missing
// dimension is better than a broken page.
//
// The probe is cached permanently per URL (2026-10-20). It used to assume the detail pages were
// ISR and so ran "at most once an hour", but those pages have rendered on every request since
// I-172, so every visit, bots included, downloaded the full photo from Supabase and decoded it:
// Supabase egress plus Vercel CPU on each hit. Image URLs never change (every upload writes a
// random filename, I-161), so one probe per URL is enough forever. It fetches through the
// Cloudflare CDN, and og:image itself points at the CDN, so social crawlers stay off Supabase too.
//
// Kept in its own file, deliberately not in `lib/site.ts`: that module is imported by client
// components too, and a dynamic `import("sharp")` anywhere in a module a client component pulls
// in still gets analyzed for the client bundle — `sharp`/`detect-libc` need Node's `fs`/
// `child_process`, unavailable in the browser, and broke the build. Only import this file from
// `generateMetadata` (server-only) functions.
type ImageMeta = { width: number; height: number; type: string };

// Throws on transient failures (network, non-2xx) so they are not cached: unstable_cache only
// stores a returned value. A definitive "no usable dimensions" is returned as null and cached.
const probeImage = unstable_cache(
  async (url: string): Promise<ImageMeta | null> => {
    if (await assertPublicUrl(url)) return null;
    const sharp = (await import("sharp")).default;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000), cache: "no-store" });
    if (!res.ok) throw new Error(`og image probe: HTTP ${res.status}`);
    const { width, height, format } = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
    if (!width || !height) return null;
    return { width, height, type: format === "png" ? "image/png" : format === "webp" ? "image/webp" : "image/jpeg" };
  },
  ["og-image-probe-v1"],
  { revalidate: false },
);

export async function ogImage(entityImageUrl?: string | null) {
  if (!entityImageUrl) {
    return { url: SITE_OG_IMAGE, width: 1280, height: 1024, type: "image/jpeg" };
  }
  const url = toCdnUrl(entityImageUrl);
  try {
    const meta = await probeImage(url);
    return meta ? { url, ...meta } : { url };
  } catch {
    return { url };
  }
}

// For the twitter:image tags next to og:image: same CDN host, no probe needed.
export function socialImageUrl(entityImageUrl?: string | null): string {
  return entityImageUrl ? toCdnUrl(entityImageUrl) : SITE_OG_IMAGE;
}
