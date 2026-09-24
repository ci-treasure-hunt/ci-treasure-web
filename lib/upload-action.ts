import sharp from "sharp";

import { createAdminClient, toStorageBody } from "@/lib/supabase/admin";
import { getMediumUrl, getSmallUrl } from "@/lib/image-url";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB } from "@/lib/upload-limits";

// Plain server-only helper, called from app/api/admin/event-image and
// app/api/organizer/event-image route handlers (Route Handlers, not Server Actions —
// consistent with the rest of this app's upload routes, though that choice turned out to
// be unrelated to the actual corruption bug; see toStorageBody in lib/supabase/admin.ts
// for the real fix and docs/issues/i-122-image-handling.md for the full investigation).
// PNG accepted too (I-111 3a: phone screenshots from the public photo form); every upload is
// re-encoded below, so nothing but JPEG/WebP ever reaches storage.
const ALLOWED_TYPES = ["image/jpeg", "image/webp", "image/png"];
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

// Buckets that hold the large/medium/small trio written here. I-111 3a generalised this from
// event-images only, instead of copying it for communities.
export type ImageBucket = "event-images" | "community-images";

export async function resizeAndUploadEventImage(file: File): Promise<string> {
  return resizeAndUploadImage(file, "event-images");
}

// Storage writes always go through the admin (service-role) client, same as
// lib/rehost-image.ts — storage.objects has RLS enabled with no policies defined for
// these buckets, so the plain session client has no INSERT grant here. Callers still gate
// on who's allowed to call this at all.
export async function resizeAndUploadImage(file: File, bucket: ImageBucket): Promise<string> {
  if (file.size > MAX_UPLOAD_BYTES) throw new Error(`File too large (max ${MAX_UPLOAD_MB}MB)`);
  if (!ALLOWED_TYPES.includes(file.type)) throw new Error("File must be JPEG, PNG or WEBP");

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
    .from(bucket)
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
    .from(bucket)
    .upload(mediumPath, toStorageBody(mediumBuffer, "image/webp"), { contentType: "image/webp", cacheControl: '2592000' });

  if (mediumError) {
    await supabase.storage.from(bucket).remove([filePath]);
    throw mediumError;
  }

  const { error: smallError } = await supabase.storage
    .from(bucket)
    .upload(smallPath, toStorageBody(smallBuffer, "image/webp"), { contentType: "image/webp", cacheControl: '2592000' });

  if (smallError) {
    await supabase.storage.from(bucket).remove([filePath, mediumPath]);
    throw smallError;
  }

  const { data: { publicUrl } } = supabase.storage
    .from(bucket)
    .getPublicUrl(filePath);

  return publicUrl;
}

// Deletes the large/medium/small trio behind a public URL, if the URL points into `bucket`.
// Used when a photo is replaced or rejected, so storage doesn't collect orphans. Anything else
// (an external URL, another bucket) is left alone. Best effort: a failed delete only leaves an
// orphan behind, it never blocks the caller.
export async function removeImageSet(publicUrl: string | null | undefined, bucket: ImageBucket): Promise<void> {
  if (!publicUrl) return;
  const marker = `/storage/v1/object/public/${bucket}/`;
  const at = publicUrl.indexOf(marker);
  if (at === -1) return;
  const path = decodeURIComponent(publicUrl.slice(at + marker.length));
  if (!path) return;
  try {
    await createAdminClient().storage.from(bucket).remove([path, getMediumUrl(path), getSmallUrl(path)]);
  } catch {
    // Orphaned files cost a few KB; not worth failing an approval over.
  }
}
