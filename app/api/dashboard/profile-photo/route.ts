import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import sharp from "sharp";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient, toStorageBody } from "@/lib/supabase/admin";
import { getMediumUrl, getSmallUrl } from "@/lib/image-url";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB } from "@/lib/upload-limits";

// Route Handler rather than a Server Action, matching lib/upload-action.ts's other upload
// routes for consistency — not required for correctness (see toStorageBody in
// lib/supabase/admin.ts for the actual corruption fix, which was in the Storage upload call,
// not the transport into this function).
const MIN_LONG_EDGE = 200;
// I-129 Phase 2: also produce a small tile-sized photo alongside the large +
// medium ones. 0 profiles have an approved photo yet, so there's nothing to
// backfill here — but wiring this now means teacher photos are three-size-
// ready from their very first upload, ahead of I-074 Phase 3 (teacher
// listing) needing tile-sized photos. `large` stays JPEG (the only size
// feeding og:image/JSON-LD, and Telegram's link-preview unfurler doesn't
// reliably render WebP); `medium`/`small` are pure in-page uses, safe to
// convert to WebP.
const LARGE_LONG_EDGE = 1600;
const LARGE_QUALITY = 82;
const MEDIUM_LONG_EDGE = 400;
const MEDIUM_QUALITY = 75;
const SMALL_LONG_EDGE = 120;
const SMALL_QUALITY = 70;

function extractProfileImagesPath(imageUrl: string | null): string | null {
  if (!imageUrl) return null;
  const marker = "/profile-images/";
  const index = imageUrl.indexOf(marker);
  if (index === -1) return null;
  return imageUrl.slice(index + marker.length);
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) {
    return NextResponse.json({ success: false, error: "No file provided" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ success: false, error: `File too large (max ${MAX_UPLOAD_MB}MB)` }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ success: false, error: "File must be an image" }, { status: 400 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, slug, image_url")
    .eq("user_id", user.id)
    .single();

  if (profileError || !profile) {
    return NextResponse.json({ success: false, error: "Profile not found" }, { status: 404 });
  }

  const inputBuffer = Buffer.from(await file.arrayBuffer());

  let metadata;
  try {
    metadata = await sharp(inputBuffer).metadata();
  } catch {
    return NextResponse.json({ success: false, error: "Could not read image file" }, { status: 400 });
  }

  const longEdge = Math.max(metadata.width ?? 0, metadata.height ?? 0);
  if (longEdge < MIN_LONG_EDGE) {
    return NextResponse.json(
      { success: false, error: `Image too small (minimum ${MIN_LONG_EDGE}px)` },
      { status: 400 },
    );
  }

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
    return NextResponse.json({ success: false, error: "Could not process image" }, { status: 400 });
  }

  const admin = createAdminClient();
  // Random filename per upload (matches lib/upload-action.ts, lib/rehost-image.ts) rather than
  // the old deterministic `${profile.slug}.jpg` — a replacement now always produces a URL no
  // cache has seen before, so the CDN Worker in front of Storage (infra-reference.md) never
  // serves a stale photo. The orphan cleanup below already existed for the legacy-extension edge
  // case; with a random name it now does the real work of removing the previous file on every
  // replacement, not just that edge case.
  const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
  const mediumPath = getMediumUrl(path);
  const smallPath = getSmallUrl(path);

  const { error: uploadError } = await admin.storage
    .from("profile-images")
    .upload(path, toStorageBody(largeBuffer, "image/jpeg"), { contentType: "image/jpeg", upsert: true, cacheControl: "2592000" });

  if (uploadError) {
    return NextResponse.json({ success: false, error: uploadError.message }, { status: 500 });
  }

  // Atomic-ish: large uploads first, then medium/small. If either smaller
  // upload fails, roll back everything uploaded so far so storage never ends
  // up with a large file and missing medium/small siblings (I-129 — see spec
  // for why this isn't a DB column).
  const { error: mediumError } = await admin.storage
    .from("profile-images")
    .upload(mediumPath, toStorageBody(mediumBuffer, "image/webp"), { contentType: "image/webp", upsert: true, cacheControl: "2592000" });

  if (mediumError) {
    await admin.storage.from("profile-images").remove([path]);
    return NextResponse.json({ success: false, error: mediumError.message }, { status: 500 });
  }

  const { error: smallError } = await admin.storage
    .from("profile-images")
    .upload(smallPath, toStorageBody(smallBuffer, "image/webp"), { contentType: "image/webp", upsert: true, cacheControl: "2592000" });

  if (smallError) {
    await admin.storage.from("profile-images").remove([path, mediumPath]);
    return NextResponse.json({ success: false, error: smallError.message }, { status: 500 });
  }

  // Orphan cleanup: if the previous image_url pointed into this bucket under a
  // different path than what we just wrote (e.g. a legacy/manually-set URL
  // with a different extension), remove it (and its medium/small) so it
  // doesn't linger unreferenced.
  const previousPath = extractProfileImagesPath(profile.image_url);
  if (previousPath && previousPath !== path) {
    await admin.storage.from("profile-images").remove([
      previousPath,
      getMediumUrl(previousPath),
      getSmallUrl(previousPath),
    ]);
  }

  const { data: { publicUrl } } = admin.storage.from("profile-images").getPublicUrl(path);

  const creditRaw = formData.get("credit");
  const credit = typeof creditRaw === "string" && creditRaw.trim() !== "" ? creditRaw.trim() : null;

  // Uses the caller's own RLS-scoped client, not the admin client: image_status
  // must always go through the trigger's authorization path (protect_profile_image_status,
  // migration 20260711172000), which allows any authenticated owner to set it back to
  // 'pending' but not to 'approved'/'rejected'. Every upload resets to pending, no exceptions.
  const { error: updateError } = await supabase
    .from("profiles")
    .update({
      image_url: publicUrl,
      image_credit: credit,
      image_status: "pending",
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);

  if (updateError) {
    return NextResponse.json({ success: false, error: updateError.message }, { status: 500 });
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/profile/edit");
  // Deliberately not revalidating /teachers/[slug] - a pending photo isn't
  // publicly visible yet, so there's nothing new to show there.

  return NextResponse.json({ success: true });
}
