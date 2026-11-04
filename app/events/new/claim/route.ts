import { NextResponse, type NextRequest } from "next/server";

import { claimEventSubmission, parseClaimRoles } from "@/lib/event-submission-claim";
import { createClient } from "@/lib/supabase/server";

// I-192 stage 3: the link step 2 sends an organizer or teacher to, through sign-in
// (/auth?next=<this URL>). ?e=<event id>&t=<ticket>&r=organizer,teacher
// Signed out → sign in and come back. No profile yet → create one, then this same link again
// (the claim is idempotent and links the profile then). Done → the edit form, step 3.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const eventId = searchParams.get("e") ?? "";
  const ticket = searchParams.get("t") ?? "";
  const roles = parseClaimRoles(searchParams.get("r"));
  const self = `/events/new/claim?${new URLSearchParams({ e: eventId, t: ticket, r: roles.join(",") })}`;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL(`/auth?next=${encodeURIComponent(self)}`, request.url));
  }

  const outcome = await claimEventSubmission({ eventId, ticket, roles, userId: user.id });
  switch (outcome.kind) {
    case "done":
      return NextResponse.redirect(new URL(`/events/${outcome.slug}/edit?step=details`, request.url));
    case "needs_profile":
      return NextResponse.redirect(new URL(`/dashboard/new-profile?next=${encodeURIComponent(self)}`, request.url));
    default:
      return NextResponse.redirect(new URL(`/events/new/done?state=${outcome.kind}`, request.url));
  }
}
