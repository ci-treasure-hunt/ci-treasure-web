// Client-side pre-compression before an image upload leaves the browser. Two independent
// reasons this exists, not one:
// 1. Vercel Functions hard-cap request bodies at 4.5MB (infra-level, not configurable via
//    next.config/vercel.json) — this applies equally to the Route Handlers behind
//    /api/dashboard/profile-photo, /api/admin/event-image, /api/organizer/event-image. A
//    phone photo (commonly 2-10MB straight off the camera) can exceed that before the
//    server ever gets a chance to resize it, failing with an opaque 413.
// 2. Faster uploads on a slow connection, since a resized JPEG is typically a few hundred
//    KB vs several MB.
//
// This is a courtesy pass, not the source of truth — the server (sharp, in
// lib/upload-action.ts and app/api/dashboard/profile-photo) always re-resizes and
// re-compresses from scratch regardless of what the client sent, so a client that skips
// this (old browser, JS disabled path, direct API call) still gets a correctly processed
// image; it just risks the 4.5MB ceiling on the raw upload.
const MAX_LONG_EDGE = 2000;
const JPEG_QUALITY = 0.85;
// Upper bound on what's worth even attempting to decode in-browser — well above any real
// photo (compression targets a few hundred KB-1MB output), but low enough to avoid handing
// createImageBitmap a pathological file (a huge TIFF, an accidentally-selected video) and
// spiking memory/hanging the tab on a low-end phone. Above this, skip straight to the
// existing "return file unchanged" fallback and let the normal size check downstream
// (client-side MAX_UPLOAD_BYTES gate, or the server's) reject it with a normal error.
const RAW_DECODE_CEILING_BYTES = 25 * 1024 * 1024;

export async function compressImageForUpload(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  if (file.size > RAW_DECODE_CEILING_BYTES) return file;

  let bitmap: ImageBitmap;
  try {
    // imageOrientation: 'from-image' bakes EXIF rotation into the pixels we draw — without
    // it, a canvas re-encode silently drops the orientation tag (canvas never writes EXIF)
    // while leaving the pixels un-rotated, turning any sideways phone photo upside down.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // Unsupported format (e.g. HEIC in browsers without decode support) or API unavailable —
    // fall back to the original file untouched; the server-side sharp pass still handles it.
    return file;
  }

  const scale = Math.min(1, MAX_LONG_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
  );
  // Small/already-compressed images can come back larger after re-encoding — keep
  // whichever is smaller rather than always trusting the compressed output.
  if (!blob || blob.size >= file.size) return file;

  const baseName = file.name.replace(/\.[^./\\]+$/, "") || "photo";
  return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
}
