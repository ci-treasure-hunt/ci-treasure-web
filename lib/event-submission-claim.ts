import { createAdminClient } from "@/lib/supabase/admin";
import { buildEventSlug } from "@/lib/events";
import { verifyEventSubmitTicket } from "@/lib/event-submit-ticket";

// I-192 stage 3: after a signed-out submitter said "I organize it" / "I teach at it" in step 2 and
// signed in, the event becomes theirs: events.user_id (so the edit form and dashboard work, same as
// a signed-in submission) and their profile linked by role, on every date of a repeating event.
//
// Server-only, called from app/events/new/claim/route.ts. Not a server action: it trusts the
// ticket check below plus the signed-in user the route passes in, nothing from the browser.
// Idempotent, so the same link works again after the person has created their profile.

export type ClaimRole = "organizer" | "teacher";

export type ClaimOutcome =
  | { kind: "expired" }
  | { kind: "taken" }
  | { kind: "needs_profile" }
  | { kind: "done"; slug: string };

export function parseClaimRoles(raw: string | null): ClaimRole[] {
  const parts = String(raw ?? "").split(",");
  return (["organizer", "teacher"] as const).filter((r) => parts.includes(r));
}

export async function claimEventSubmission(opts: {
  eventId: string;
  ticket: string;
  roles: ClaimRole[];
  userId: string;
}): Promise<ClaimOutcome> {
  if (!opts.roles.length || !verifyEventSubmitTicket(opts.eventId, opts.ticket)) return { kind: "expired" };
  const admin = createAdminClient();

  const { data: submission } = await admin
    .from("event_submissions")
    .select("id, user_id")
    .eq("event_id", opts.eventId)
    .maybeSingle();
  const { data: event } = await admin
    .from("events")
    .select("id, short_id, title, user_id, series_id, status")
    .eq("id", opts.eventId)
    .maybeSingle();
  if (!submission || !event) return { kind: "expired" };
  if (submission.user_id && submission.user_id !== opts.userId) return { kind: "taken" };
  if (event.user_id && event.user_id !== opts.userId) return { kind: "taken" };

  // Every date of a repeating event created by this submission (they share the series and have
  // no owner yet); a one-off is just this row.
  let eventIds = [event.id as string];
  if (event.series_id) {
    const { data: siblings } = await admin
      .from("events")
      .select("id")
      .eq("series_id", event.series_id)
      .is("user_id", null);
    eventIds = [...new Set([event.id as string, ...(siblings ?? []).map((r) => r.id as string)])];
  }

  await admin.from("events").update({ user_id: opts.userId, updated_by: opts.userId }).in("id", eventIds).is("user_id", null);
  await admin
    .from("event_submissions")
    .update({ user_id: opts.userId, roles: opts.roles, claimed_at: new Date().toISOString() })
    .eq("id", submission.id);
  if (event.series_id) {
    await admin.from("event_series").update({ created_by: opts.userId }).eq("id", event.series_id).is("created_by", null);
  }

  const { data: profile } = await admin.from("profiles").select("id").eq("user_id", opts.userId).maybeSingle();
  if (!profile) return { kind: "needs_profile" };

  if (opts.roles.includes("organizer")) {
    const { data: existing } = await admin
      .from("event_organizers")
      .select("event_id")
      .eq("organizer_id", profile.id)
      .in("event_id", eventIds);
    const have = new Set((existing ?? []).map((r) => r.event_id as string));
    const rows = eventIds.filter((id) => !have.has(id)).map((id) => ({ event_id: id, organizer_id: profile.id, role: "lead" }));
    if (rows.length) {
      const { error } = await admin.from("event_organizers").insert(rows);
      if (error) console.error("claim: event_organizers link failed:", error.message);
    }
  }
  if (opts.roles.includes("teacher")) {
    const { data: existing } = await admin
      .from("event_teachers")
      .select("event_id")
      .eq("teacher_id", profile.id)
      .in("event_id", eventIds);
    const have = new Set((existing ?? []).map((r) => r.event_id as string));
    const rows = eventIds.filter((id) => !have.has(id)).map((id) => ({ event_id: id, teacher_id: profile.id, role: "teacher" }));
    if (rows.length) {
      const { error } = await admin.from("event_teachers").insert(rows);
      if (error) console.error("claim: event_teachers link failed:", error.message);
    }
  }

  return { kind: "done", slug: buildEventSlug(event.short_id as string, event.title as string) };
}
