import { NextResponse, type NextRequest } from "next/server";

import { requireAdminRequestUser } from "@/lib/admin-api";
import { CommunitySaveError, saveCommunity } from "@/lib/community-save";

// I-111: create a community from /admin/communities/new. Admin-entered, so it lands with whatever
// status the form sends (published by default), unlike the public Add form which always creates
// 'pending'.
export async function POST(request: NextRequest) {
  try {
    await requireAdminRequestUser(request);
    const payload = await request.json();
    const community = await saveCommunity(payload, null);
    return NextResponse.json({ community });
  } catch (error) {
    if (error instanceof CommunitySaveError) {
      return NextResponse.json({ error: error.message, fieldErrors: error.fieldErrors }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create community." },
      { status: 500 },
    );
  }
}
