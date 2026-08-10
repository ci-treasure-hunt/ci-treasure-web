import { NextResponse, type NextRequest } from "next/server";
import crypto from "crypto";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "no file" }, { status: 400 });
  const buf = Buffer.from(await file.arrayBuffer());
  return NextResponse.json({
    size: buf.length,
    sha256: crypto.createHash("sha256").update(buf).digest("hex"),
  });
}
