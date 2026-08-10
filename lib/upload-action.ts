import sharp from "sharp";

import { createAdminClient, toStorageBody } from "@/lib/supabase/admin";
import { getMediumUrl, getSmallUrl } from "@/lib/image-url";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB } from "@/lib/upload-limits";

// Plain server-only helper, called from app/api/admin/event-image and
// app/api/organizer/event-image route handlers (Route Handlers, not Server Actions —
// consistent with the rest of this app's upload routes, though that choice turned out to
// be unrelated to the actual corruption bug; see toStorageBody in lib/supabase/admin.ts
// for the real fix and docs/issues/i-122-image-handling.md for the full investigation).
const ALLOWED_TYPES = ["image/jpeg", "image/webp"];
// Same conventions as lib/rehost-image.ts / app/api/dashboard/profile-photo (I-122/I-129): this
// path previously uploaded whatever the admin picked completely unprocessed — a real,
// uncompressed 4000px camera photo would sail straight through the type/size
// checks above. Resize + recompress here the same way the other upload paths do.
// I-129 Phase 2: `large` always stays JPEG (the only size feeding og:image/JSON-LD,
// and Telegram's link-preview unfurler doesn't reliably render WebP); `medium`/`small`
// are pure in-page uses, safe to convert to WebP for the extra compression.
const LARGE_LONG_EDGE = 1600;
const LARGE_QUALITY = 82;
const MEDIUM_LONG_EDGE = 400;
const MEDIUM_QUALITY = 75;
const SMALL_LONG_EDGE = 120;
const SMALL_QUALITY = 70;

// Storage writes always go through the admin (service-role) client, same as
// lib/rehost-image.ts — storage.objects has RLS enabled with no policies defined for
// event-images, so the plain session client has no INSERT grant here. Callers still gate
// on the session client for who's allowed to call this at all.
export async function resizeAndUploadEventImage(file: File): Promise<string> {
  if (file.size > MAX_UPLOAD_BYTES) throw new Error(`File too large (max ${MAX_UPLOAD_MB}MB)`);
  if (!ALLOWED_TYPES.includes(file.type)) throw new Error("File must be JPEG or WEBP");

  const inputBuffer = Buffer.from(await file.arrayBuffer());
  let largeBuffer: Buffer;
  let mediumBuffer: Buffer;
  let smallBuffer: Buffer;
  try {
    const rotated = sharp(inputBuffer).rotate();
    largeBuffer = await rotated
      .clone()
      .resize(LARGE_LONG_EDGE, LARGE_LONG_EDGE, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: LARGE_QUALITY })
      .toBuffer();
    mediumBuffer = await rotated
      .clone()
      .resize(MEDIUM_LONG_EDGE, MEDIUM_LONG_EDGE, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: MEDIUM_QUALITY })
      .toBuffer();
    smallBuffer = await rotated
      .clone()
      .resize(SMALL_LONG_EDGE, SMALL_LONG_EDGE, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: SMALL_QUALITY })
      .toBuffer();
  } catch {
    throw new Error("Could not process image");
  }

  const supabase = createAdminClient();
  const fileName = `${Math.random().toString(36).substring(2)}-${Date.now()}.jpg`;
  const filePath = fileName;
  const mediumPath = getMediumUrl(filePath);
  const smallPath = getSmallUrl(filePath);

  const { error } = await supabase.storage
    .from('event-images')
    // 30 days — Supabase's default is 1h, which PageSpeed Insights flagged as
    // ~14.7MB in avoidable re-fetches across the homepage's event images.
    .upload(filePath, toStorageBody(largeBuffer, "image/jpeg"), { contentType: "image/jpeg", cacheControl: '2592000' });

  if (error) {
    throw error;
  }

  // Atomic-ish: large uploads first, then medium/small. If either smaller
  // upload fails, roll back everything uploaded so far so storage never ends
  // up with a large file and missing medium/small siblings (I-129 — see spec
  // for why this isn't a DB column).
  const { error: mediumError } = await supabase.storage
    .from('event-images')
    .upload(mediumPath, toStorageBody(mediumBuffer, "image/webp"), { contentType: "image/webp", cacheControl: '2592000' });

  if (mediumError) {
    await supabase.storage.from('event-images').remove([filePath]);
    throw mediumError;
  }

  const { error: smallError } = await supabase.storage
    .from('event-images')
    .upload(smallPath, toStorageBody(smallBuffer, "image/webp"), { contentType: "image/webp", cacheControl: '2592000' });

  if (smallError) {
    await supabase.storage.from('event-images').remove([filePath, mediumPath]);
    throw smallError;
  }

  const { data: { publicUrl } } = supabase.storage
    .from('event-images')
    .getPublicUrl(filePath);

  return publicUrl;
}
