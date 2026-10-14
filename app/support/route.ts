import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { SUPPORT_SOURCES, SUPPORT_TARGET } from "@/lib/support";

// I-173 option F: count the click by source, then hand over to Buy Me a Coffee. The count is
// best-effort: a failed insert must never stand between someone and the support page.
export async function GET(request: NextRequest) {
  const from = request.nextUrl.searchParams.get("from") ?? "";
  const source = (SUPPORT_SOURCES as readonly string[]).includes(from) ? from : "other";
  try {
    await createAdminClient().from("support_clicks").insert({ source });
  } catch (error) {
    console.error("support click log failed:", error instanceof Error ? error.message : error);
  }
  return NextResponse.redirect(SUPPORT_TARGET, 302);
}
