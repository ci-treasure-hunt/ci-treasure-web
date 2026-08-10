import { NextResponse, type NextRequest } from "next/server";
import crypto from "crypto";
import sharp from "sharp";

import { createAdminClient } from "@/lib/supabase/admin";

function sha256(buf: Buffer) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

// Diagnostic-only: pinpoints which stage of the real upload pipeline (raw receive -> sharp
// processing -> Supabase Storage upload -> public re-fetch) introduces corruption, given the
// raw-receive stage was already proven clean via a separate byte-identical SHA-256 test.
// Deleted once the root cause is found.
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "no file" }, { status: 400 });

  const rawBuf = Buffer.from(await file.arrayBuffer());
  const rawSha256 = sha256(rawBuf);
  const rawFirstBytes = rawBuf.subarray(0, 8).toString("hex");

  let sharpBuf: Buffer;
  try {
    sharpBuf = await sharp(rawBuf).rotate().resize(1600, 1600, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
  } catch (e) {
    return NextResponse.json({ stage: "sharp", error: e instanceof Error ? e.message : String(e), rawSha256, rawFirstBytes });
  }
  const sharpSha256 = sha256(sharpBuf);
  const sharpFirstBytes = sharpBuf.subarray(0, 8).toString("hex");
  const sharpValidJpegHeader = sharpBuf[0] === 0xff && sharpBuf[1] === 0xd8;

  const admin = createAdminClient();
  const testPath = `_diagnostic-test-${Date.now()}.jpg`;
  const { error: uploadError } = await admin.storage
    .from("profile-images")
    .upload(testPath, sharpBuf, { contentType: "image/jpeg", upsert: true });

  if (uploadError) {
    return NextResponse.json({ stage: "upload", error: uploadError.message, rawSha256, sharpSha256, sharpValidJpegHeader });
  }

  const { data: { publicUrl } } = admin.storage.from("profile-images").getPublicUrl(testPath);
  const refetchRes = await fetch(publicUrl, { cache: "no-store" });
  const refetchBuf = Buffer.from(await refetchRes.arrayBuffer());
  const refetchSha256 = sha256(refetchBuf);
  const refetchFirstBytes = refetchBuf.subarray(0, 8).toString("hex");

  await admin.storage.from("profile-images").remove([testPath]);

  return NextResponse.json({
    rawSha256,
    rawFirstBytes,
    sharpSha256,
    sharpFirstBytes,
    sharpValidJpegHeader,
    sharpBufLength: sharpBuf.length,
    refetchSha256,
    refetchFirstBytes,
    refetchLength: refetchBuf.length,
    sharpMatchesRefetch: sharpSha256 === refetchSha256,
  });
}
