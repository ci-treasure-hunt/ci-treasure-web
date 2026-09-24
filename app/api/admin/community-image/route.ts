import { NextResponse, type NextRequest } from "next/server";

import { requireAdminRequestUser } from "@/lib/admin-api";
import { resizeAndUploadImage } from "@/lib/upload-action";

// I-111 3a: admin photo upload in /admin/communities/[id]/edit. Returns the public URL; the editor
// puts it in the form and saveCommunity() writes it, so there's no moderation step for admins.
export async function POST(request: NextRequest) {
  try {
    await requireAdminRequestUser(request);

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const url = await resizeAndUploadImage(file, "community-images");
    return NextResponse.json({ url });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to upload image." },
      { status: 500 },
    );
  }
}
