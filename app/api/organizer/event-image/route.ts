import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { resizeAndUploadEventImage } from "@/lib/upload-action";

// Found live 2026-07-22: the organizer event form only had a paste-a-URL field, no direct file
// upload — the admin form got this dropzone but organizers never did. Same processing, gated by
// "signed in with a claimed profile" (the same requirement createEvent already enforces) instead
// of admin-only.
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!profile) {
      return NextResponse.json(
        { error: "Claim or create your profile before uploading images" },
        { status: 403 },
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const url = await resizeAndUploadEventImage(file);
    return NextResponse.json({ url });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to upload image." },
      { status: 500 },
    );
  }
}
