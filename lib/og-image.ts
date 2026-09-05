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
// file via `sharp` at generateMetadata time. Pages here are ISR (`revalidate = 3600`), so this
// runs at most once per hour per page, not per request. Falls back to a bare `{ url }` (same as
// before) if the probe fails for any reason — a missing dimension is better than a broken page.
//
// Kept in its own file, deliberately not in `lib/site.ts`: that module is imported by client
// components too, and a dynamic `import("sharp")` anywhere in a module a client component pulls
// in still gets analyzed for the client bundle — `sharp`/`detect-libc` need Node's `fs`/
// `child_process`, unavailable in the browser, and broke the build. Only import this file from
// `generateMetadata` (server-only) functions.
export async function ogImage(entityImageUrl?: string | null) {
  if (!entityImageUrl) {
    return { url: SITE_OG_IMAGE, width: 1280, height: 1024, type: "image/jpeg" };
  }
  try {
    const blocked = await assertPublicUrl(entityImageUrl);
    if (blocked) return { url: entityImageUrl };

    const sharp = (await import("sharp")).default;
    const res = await fetch(entityImageUrl, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { url: entityImageUrl };
    const buffer = Buffer.from(await res.arrayBuffer());
    const { width, height, format } = await sharp(buffer).metadata();
    if (!width || !height) return { url: entityImageUrl };
    return {
      url: entityImageUrl,
      width,
      height,
      type: format === "png" ? "image/png" : format === "webp" ? "image/webp" : "image/jpeg",
    };
  } catch {
    return { url: entityImageUrl };
  }
}
