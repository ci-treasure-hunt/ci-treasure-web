"use server";

import { revalidatePath } from "next/cache";

import { requireAdminUser } from "@/lib/admin-auth";
import { sendEmail } from "@/lib/email";
import { buildEventSlug } from "@/lib/events";
import { fbGroupsForEvent } from "@/lib/fb-groups";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUPPORT_EMAIL_LINES, supportHref } from "@/lib/support";

// Share kit (nudge 5, 2026-10-15): the moment an event goes live is when the organizer is most
// likely to pass the link on, and every share brings dancers to the listing.
const SHARE_EMAIL_LINE =
  "Share this link with your community, in your group chats and on social media, so more dancers find it.";

// I-189: the Facebook groups this event fits (regional 2+ days, international 4+), as email lines.
// Empty for 1-day events and anything outside the three regions, so the email stays as it was.
function fbGroupEmailLines(event: { country: string | null; start_date: string; end_date: string | null }) {
  const groups = fbGroupsForEvent({ country: event.country, startDate: event.start_date, endDate: event.end_date });
  if (groups.length === 0) return [];
  return [
    `You can also post it in our Facebook ${groups.length > 1 ? "groups" : "group"}:`,
    ...groups.map((g) => `${g.name}: ${g.url}`),
    "",
  ];
}

// I-192: someone passed this event on (event_submissions with no role) and left an address, or was
// signed in while sharing. Thank them once it is live: it is their work too, and the moment it goes
// up is when they are most likely to share it. Not on reject: the event was not theirs to fix.
// The owner email above covers organizers and teachers (events.user_id); a shared submission has
// no owner, so nobody gets two emails.
async function notifySharersLive(
  admin: ReturnType<typeof createAdminClient>,
  eventIds: string[],
  event: { title: string; short_id: string },
) {
  if (!eventIds.length) return;
  const { data: rows } = await admin
    .from("event_submissions")
    .select("email, user_id, roles")
    .in("event_id", eventIds);
  const recipients = new Set<string>();
  for (const row of rows ?? []) {
    if ((row.roles as string[] | null)?.length) continue;
    const address = (row.email as string | null) ?? (await submitterEmail(admin, (row.user_id as string | null) ?? null));
    if (address) recipients.add(address.toLowerCase());
  }
  if (!recipients.size) return;

  const url = `https://citreasurehunt.com/events/${buildEventSlug(event.short_id, event.title)}`;
  for (const to of recipients) {
    const result = await sendEmail({
      to,
      subject: `Thank you: "${event.title}" is now on CI Treasure Hunt`,
      text: [
        `Thank you for passing on "${event.title}". We checked it, added the details, and it is now live:`,
        url,
        "",
        "Share the link with the people you dance with, so more dancers find it.",
        "",
        "New events are announced in our Telegram group: https://t.me/citreasurehunt",
        "And once a month in the newsletter: https://citreasurehunt.com/newsletter",
        "",
        "Seen another event? You can add it here: https://citreasurehunt.com/events/new",
        "",
        "CI Treasure Hunt is free, and I build and run it on my own. If it helps you find where to dance,",
        "a small monthly contribution keeps it going:",
        supportHref("share_email", true),
        "",
        "— CI Treasure Hunt",
      ].join("\n"),
    });
    if (!result.ok) console.error("sharer live email failed:", result.error);
  }
}

// Look up the submitter's email from the event's user_id.
async function submitterEmail(admin: ReturnType<typeof createAdminClient>, userId: string | null) {
  if (!userId) return null;
  const { data } = await admin.auth.admin.getUserById(userId);
  return data?.user?.email ?? null;
}

export type PendingEventOrganizer = {
  profileId: string;
  name: string;
  isTrusted: boolean;
};

export type PendingEvent = {
  id: string;
  title: string;
  startDate: string | null;
  city: string | null;
  country: string | null;
  organizer: PendingEventOrganizer | null;
  // I-171: set when the date belongs to a series, so the queue can review all its pending
  // dates as one card (approveSeries/rejectSeries) instead of one row per date.
  series: { id: string; title: string } | null;
  // I-192 stage 3: from event_submissions, when the event came through the three-step flow.
  submission: PendingSubmission | null;
};

export type PendingSubmission = {
  // "organizer" / "teacher"; empty = passed on by someone else ("shared").
  roles: string[];
  signedIn: boolean;
  email: string | null;
  sourceUrl: string | null;
  pastedText: string | null;
};

export async function getPendingEvents(): Promise<PendingEvent[]> {
  await requireAdminUser();
  const admin = createAdminClient();

  const { data } = await admin
    .from("events")
    .select(
      "id, title, start_date, city, country, series_id, event_series(title), event_organizers(role, profiles(id, name, is_trusted, user_id))",
    )
    .eq("status", "pending")
    .order("start_date", { ascending: true });

  const ids = (data ?? []).map((e) => e.id as string);
  const { data: submissionRows } = ids.length
    ? await admin
        .from("event_submissions")
        .select("event_id, roles, user_id, email, source_url, pasted_text")
        .in("event_id", ids)
    : { data: [] };
  const submissions = new Map(
    (submissionRows ?? []).map((r) => [
      r.event_id as string,
      {
        roles: (r.roles as string[]) ?? [],
        signedIn: Boolean(r.user_id),
        email: (r.email as string) ?? null,
        sourceUrl: (r.source_url as string) ?? null,
        pastedText: (r.pasted_text as string) ?? null,
      } satisfies PendingSubmission,
    ]),
  );

  return (data ?? []).map((event) => {
    // Prefer a claimed (user_id set) lead organizer. Supabase typegen types a
    // to-one embed as an array, but it's a single object at runtime — assert via unknown.
    const links = (event.event_organizers ?? []) as unknown as Array<{
      role: string | null;
      profiles: { id: string; name: string; is_trusted: boolean; user_id: string | null } | null;
    }>;
    const claimed = links.find((l) => l.profiles?.user_id) ?? links[0];
    const profile = claimed?.profiles ?? null;

    return {
      id: event.id as string,
      title: event.title as string,
      startDate: (event.start_date as string) ?? null,
      city: (event.city as string) ?? null,
      country: (event.country as string) ?? null,
      organizer: profile
        ? { profileId: profile.id, name: profile.name, isTrusted: profile.is_trusted }
        : null,
      series: event.series_id
        ? {
            id: event.series_id as string,
            title: ((event.event_series as unknown as { title?: string } | null)?.title ?? event.title) as string,
          }
        : null,
      submission: submissions.get(event.id as string) ?? null,
    };
  });
}

export async function approveEvent(eventId: string): Promise<{ success: boolean; error?: string }> {
  await requireAdminUser();
  const admin = createAdminClient();

  const { data: event } = await admin
    .from("events")
    .select("title, short_id, user_id, country, start_date, end_date")
    .eq("id", eventId)
    .maybeSingle();

  // pending → published fires the announce Edge Function via the UPDATE trigger.
  const { error } = await admin.from("events").update({ status: "published" }).eq("id", eventId);
  if (error) {
    return { success: false, error: error.message };
  }

  // Notify the organizer (non-fatal).
  const email = await submitterEmail(admin, event?.user_id ?? null);
  if (email && event) {
    const url = `https://citreasurehunt.com/events/${buildEventSlug(event.short_id, event.title)}`;
    const result = await sendEmail({
      to: email,
      subject: `Your event "${event.title}" is now live`,
      text: [
        `Good news — your event "${event.title}" has been approved and is now published on CI Treasure Hunt:`,
        url,
        "",
        SHARE_EMAIL_LINE,
        "",
        ...fbGroupEmailLines(event),
        "You can edit it anytime from your dashboard: https://citreasurehunt.com/dashboard",
        "",
        ...SUPPORT_EMAIL_LINES,
        "",
        "— CI Treasure Hunt",
      ].join("\n"),
    });
    if (!result.ok) console.error("approve email failed:", result.error);
  }
  if (event) await notifySharersLive(admin, [eventId], event);

  revalidatePath("/admin/events/pending");
  revalidatePath("/");
  return { success: true };
}

export async function rejectEvent(
  eventId: string,
  reason: string,
): Promise<{ success: boolean; error?: string }> {
  await requireAdminUser();
  const admin = createAdminClient();

  const { data: event } = await admin
    .from("events")
    .select("title, user_id")
    .eq("id", eventId)
    .maybeSingle();

  const trimmedReason = reason.trim();
  const { error } = await admin
    .from("events")
    .update({ status: "rejected", admin_notes: trimmedReason || null })
    .eq("id", eventId);
  if (error) {
    return { success: false, error: error.message };
  }

  // Notify the organizer with the reason (non-fatal).
  const email = await submitterEmail(admin, event?.user_id ?? null);
  if (email && event) {
    const result = await sendEmail({
      to: email,
      subject: `Your event "${event.title}" needs changes`,
      text: [
        `Your event "${event.title}" wasn't published yet.`,
        trimmedReason ? `\nReason: ${trimmedReason}` : "",
        "",
        "You can update and resubmit it from your dashboard: https://citreasurehunt.com/dashboard",
        "",
        "— CI Treasure Hunt",
      ]
        .filter(Boolean)
        .join("\n"),
    });
    if (!result.ok) console.error("reject email failed:", result.error);
  }

  revalidatePath("/admin/events/pending");
  return { success: true };
}

export async function trustOrganizer(profileId: string): Promise<{ success: boolean; error?: string }> {
  await requireAdminUser();
  const admin = createAdminClient();
  const { error } = await admin.from("profiles").update({ is_trusted: true }).eq("id", profileId);
  if (error) {
    return { success: false, error: error.message };
  }
  revalidatePath("/admin/events/pending");
  return { success: true };
}

// I-171: review a series' pending dates in one go. One UPDATE, so all dates flip together and
// the announce series guard (_shared/series-guard.ts) posts only the earliest identical date.
// One email for the whole series, not one per date.
export async function approveSeries(seriesId: string): Promise<{ success: boolean; error?: string }> {
  await requireAdminUser();
  const admin = createAdminClient();

  const { data: dates } = await admin
    .from("events")
    .select("id, title, short_id, user_id, start_date")
    .eq("series_id", seriesId)
    .eq("status", "pending")
    .order("start_date");
  if (!dates?.length) return { success: false, error: "No pending dates in this series." };

  const { error } = await admin
    .from("events")
    .update({ status: "published" })
    .eq("series_id", seriesId)
    .eq("status", "pending");
  if (error) return { success: false, error: error.message };

  const first = dates[0];
  const email = await submitterEmail(admin, first.user_id ?? null);
  if (email) {
    const url = `https://citreasurehunt.com/events/${buildEventSlug(first.short_id, first.title)}`;
    const result = await sendEmail({
      to: email,
      subject: `Your event "${first.title}" is now live`,
      text: [
        `Good news — "${first.title}" has been approved and is now published on CI Treasure Hunt, with ${dates.length} ${dates.length === 1 ? "date" : "dates"}:`,
        dates.map((d) => d.start_date).join(", "),
        "",
        url,
        "",
        SHARE_EMAIL_LINE,
        "",
        "You can edit each date from your dashboard: https://citreasurehunt.com/dashboard",
        "",
        ...SUPPORT_EMAIL_LINES,
        "",
        "— CI Treasure Hunt",
      ].join("\n"),
    });
    if (!result.ok) console.error("approve series email failed:", result.error);
  }
  await notifySharersLive(admin, dates.map((d) => d.id as string), first);

  revalidatePath("/admin/events/pending");
  revalidatePath(`/admin/series/${seriesId}`);
  revalidatePath("/");
  return { success: true };
}

export async function rejectSeries(seriesId: string, reason: string): Promise<{ success: boolean; error?: string }> {
  await requireAdminUser();
  const admin = createAdminClient();

  const { data: dates } = await admin
    .from("events")
    .select("title, user_id")
    .eq("series_id", seriesId)
    .eq("status", "pending")
    .order("start_date");
  if (!dates?.length) return { success: false, error: "No pending dates in this series." };

  const trimmedReason = reason.trim();
  const { error } = await admin
    .from("events")
    .update({ status: "rejected", admin_notes: trimmedReason || null })
    .eq("series_id", seriesId)
    .eq("status", "pending");
  if (error) return { success: false, error: error.message };

  const email = await submitterEmail(admin, dates[0].user_id ?? null);
  if (email) {
    const result = await sendEmail({
      to: email,
      subject: `Your event "${dates[0].title}" needs changes`,
      text: [
        `Your event "${dates[0].title}" (${dates.length} ${dates.length === 1 ? "date" : "dates"}) wasn't published yet.`,
        trimmedReason ? `\nReason: ${trimmedReason}` : "",
        "",
        "You can update and resubmit it from your dashboard: https://citreasurehunt.com/dashboard",
        "",
        "— CI Treasure Hunt",
      ]
        .filter(Boolean)
        .join("\n"),
    });
    if (!result.ok) console.error("reject series email failed:", result.error);
  }

  revalidatePath("/admin/events/pending");
  revalidatePath(`/admin/series/${seriesId}`);
  return { success: true };
}
