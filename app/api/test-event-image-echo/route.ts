import { NextResponse, type NextRequest } from "next/server";
import crypto from "crypto";
import sharp from "sharp";

import { createAdminClient, toStorageBody } from "@/lib/supabase/admin";

// TEMP diagnostic route — isolates where corruption enters the admin
// event-image pipeline specifically. Delete after use.
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No file" }, { status: 400 });
  }

  const inputBuffer = Buffer.from(await file.arrayBuffer());
  const inputHash = crypto.createHash("sha256").update(inputBuffer).digest("hex");
  const inputMagic = inputBuffer.subarray(0, 8).toString("hex");

  const largeBuffer = await sharp(inputBuffer)
    .rotate()
    .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer();
  const sharpHash = crypto.createHash("sha256").update(largeBuffer).digest("hex");
  const sharpMagic = largeBuffer.subarray(0, 8).toString("hex");

  const admin = createAdminClient();
  const path = `diag-${Date.now()}.jpg`;

  const { error: uploadError } = await admin.storage
    .from("event-images")
    .upload(path, toStorageBody(largeBuffer, "image/jpeg"), { contentType: "image/jpeg" });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: downloaded } = await admin.storage.from("event-images").download(path);
  let downloadHash = null;
  let downloadMagic = null;
  if (downloaded) {
    const downloadedBuffer = Buffer.from(await downloaded.arrayBuffer());
    downloadHash = crypto.createHash("sha256").update(downloadedBuffer).digest("hex");
    downloadMagic = downloadedBuffer.subarray(0, 8).toString("hex");
  }

  await admin.storage.from("event-images").remove([path]);

  return NextResponse.json({
    fileType: file.type,
    fileSize: file.size,
    inputHash,
    inputMagic,
    sharpHash,
    sharpMagic,
    downloadHash,
    downloadMagic,
    match_sharp_vs_download: sharpHash === downloadHash,
  });
}
