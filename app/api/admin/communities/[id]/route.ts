import { NextResponse, type NextRequest } from "next/server";

import { requireAdminRequestUser } from "@/lib/admin-api";
import { CommunitySaveError, saveCommunity } from "@/lib/community-save";

// I-111: save the /admin/communities/[id]/edit form.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdminRequestUser(request);
    const { id } = await params;
    const payload = await request.json();
    const community = await saveCommunity(payload, id);
    return NextResponse.json({ community });
  } catch (error) {
    if (error instanceof CommunitySaveError) {
      return NextResponse.json({ error: error.message, fieldErrors: error.fieldErrors }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update community." },
      { status: 500 },
    );
  }
}
