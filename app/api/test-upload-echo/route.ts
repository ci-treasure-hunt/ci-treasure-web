import { NextResponse, type NextRequest } from "next/server";
import crypto from "crypto";
import sharp from "sharp";

import { createClient } from "@supabase/supabase-js";

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

  // Second leg: bypass the supabase-js SDK entirely, PUT the same buffer straight to the
  // Storage REST endpoint via a raw fetch call, to isolate whether the SDK's upload()
  // wrapper (its body/isPlainObject handling) is the corrupting step, or whether raw fetch
  // with a Node Buffer body misbehaves on this runtime regardless of the SDK.
  const rawPath = `_diagnostic-raw-${Date.now()}.jpg`;
  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const rawUploadRes = await fetch(`${projectUrl}/storage/v1/object/profile-images/${rawPath}`, {
    method: "POST",
    headers: {
      apikey: serviceKey!,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "image/jpeg",
      "x-upsert": "true",
    },
    body: new Uint8Array(sharpBuf),
  });
  const rawUploadOk = rawUploadRes.ok;
  const rawUploadStatus = rawUploadRes.status;
  const rawRefetchRes = await fetch(`${projectUrl}/storage/v1/object/public/profile-images/${rawPath}`, { cache: "no-store" });
  const rawRefetchBuf = Buffer.from(await rawRefetchRes.arrayBuffer());
  const rawRefetchSha256 = sha256(rawRefetchBuf);
  const rawRefetchFirstBytes = rawRefetchBuf.subarray(0, 8).toString("hex");
  await fetch(`${projectUrl}/storage/v1/object/profile-images/${rawPath}`, {
    method: "DELETE",
    headers: { apikey: serviceKey!, Authorization: `Bearer ${serviceKey}` },
  });

  // Third leg: same SDK, same upload() call, but the client is constructed with an explicit
  // `global: { fetch }` pointing at the platform's native fetch — tests whether the SDK's
  // own internally-resolved fetch implementation (not the SDK's request-building logic
  // itself) is the actual corrupting layer.
  const nativeFetchPath = `_diagnostic-nativefetch-${Date.now()}.jpg`;
  const adminNativeFetch = createClient(projectUrl!, serviceKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: globalThis.fetch },
  });
  const { error: nativeFetchUploadError } = await adminNativeFetch.storage
    .from("profile-images")
    .upload(nativeFetchPath, sharpBuf, { contentType: "image/jpeg", upsert: true });
  let nativeFetchResult;
  if (nativeFetchUploadError) {
    nativeFetchResult = { error: nativeFetchUploadError.message };
  } else {
    const { data: { publicUrl: nativeFetchPublicUrl } } = adminNativeFetch.storage.from("profile-images").getPublicUrl(nativeFetchPath);
    const nfRes = await fetch(nativeFetchPublicUrl, { cache: "no-store" });
    const nfBuf = Buffer.from(await nfRes.arrayBuffer());
    nativeFetchResult = {
      refetchSha256: sha256(nfBuf),
      refetchFirstBytes: nfBuf.subarray(0, 8).toString("hex"),
      refetchLength: nfBuf.length,
      matches: sharpSha256 === sha256(nfBuf),
    };
    await adminNativeFetch.storage.from("profile-images").remove([nativeFetchPath]);
  }

  return NextResponse.json({
    rawSha256,
    rawFirstBytes,
    sharpSha256,
    sharpFirstBytes,
    sharpValidJpegHeader,
    sharpBufLength: sharpBuf.length,
    sdkUpload: {
      refetchSha256,
      refetchFirstBytes,
      refetchLength: refetchBuf.length,
      matches: sharpSha256 === refetchSha256,
    },
    rawFetchUpload: {
      uploadOk: rawUploadOk,
      uploadStatus: rawUploadStatus,
      refetchSha256: rawRefetchSha256,
      refetchFirstBytes: rawRefetchFirstBytes,
      refetchLength: rawRefetchBuf.length,
      matches: sharpSha256 === rawRefetchSha256,
    },
    sdkWithNativeFetch: nativeFetchResult,
  });
}
