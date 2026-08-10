import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { OrganizerEventForm } from "@/components/organizer/event-form";
import { TeacherManager } from "@/components/organizer/teacher-manager";
import { getKnownDisciplines, parseEventSlug } from "@/lib/events";
import { eventRowToFormData } from "@/lib/organizer-events";
import { createClient } from "@/lib/supabase/server";

type SegmentDisplay = { title?: string; teachers?: Array<string | { name?: string }> };

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ eventSlug: string }>;
}) {
  const { eventSlug } = await params;
  const parsed = parseEventSlug(eventSlug);
  if (!parsed) {
    notFound();
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/auth?next=/events/${eventSlug}/edit`);
  }

  const { data: event } = await supabase
    .from("events")
    .select(
      "id, short_id, title, type, start_date, end_date, timezone, city, country, address, contact_email, venue_id, venues(id, name, city, country), description, image_url, level, language, features, discipline, cancelled, cancelled_text, price, links, segments, status, user_id",
    )
    .ilike("short_id", parsed.shortId)
    .maybeSingle();
  if (!event) {
    notFound();
  }

  // Published events are readable by anyone (events_select_public), so explicitly
  // authorize edit access: owner, or linked as an organizer via an owned profile.
  let authorized = event.user_id === user.id;
  if (!authorized) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (profile) {
      const { data: link } = await supabase
        .from("event_organizers")
        .select("event_id")
        .eq("event_id", event.id)
        .eq("organizer_id", profile.id)
        .maybeSingle();
      authorized = Boolean(link);
    }
  }
  if (!authorized) {
    redirect("/dashboard");
  }

  const initial = eventRowToFormData({
    ...event,
    address: typeof event.address === "object" ? (event.address as { venue_name?: string } | null) : null,
    venues: Array.isArray(event.venues) ? event.venues[0] ?? null : event.venues,
  });
  const availablePractices = await getKnownDisciplines();

  const { data: teachers } = await supabase
    .from("event_teachers")
    .select("role, profiles(id, name, city, country)")
    .eq("event_id", event.id);

  type EventTeacherRow = {
    role: string;
    profiles: { id: string; name: string; city: string | null; country: string | null };
  };
  // profiles(...) is a to-one join, but the untyped Supabase client infers it as an array —
  // same friction lib/geocode.ts documents. Runtime shape (and the .profiles.id access below)
  // is a single object, so cast rather than fight the generic client's inferred type.
  const initialTeachers = ((teachers ?? []) as unknown as EventTeacherRow[]).map((t) => ({
    id: t.profiles.id,
    name: t.profiles.name,
    role: t.role,
    city: t.profiles.city,
    country: t.profiles.country,
  }));

  const segments = (event.segments?.items ?? event.segments ?? []) as SegmentDisplay[];
  const hasSegments = Array.isArray(segments) && segments.length > 0;

  return (
    <main className="min-h-screen bg-(--color-mist) px-5 py-10 text-slate-900 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-3xl">
        <Link href="/dashboard" className="text-sm font-medium text-(--color-pine) hover:underline">
          ← Back to dashboard
        </Link>
        <div className="mt-4">
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-(--color-pine)">Edit event</p>
          <h1 className="mt-2 font-serif text-4xl text-slate-950">{event.title}</h1>
          <p className="mt-3 text-base leading-7 text-slate-700">
            Changes save immediately. Editing a published event keeps it published — it won&apos;t need
            re-approval.
          </p>
        </div>

        <div className="mt-8">
          <OrganizerEventForm mode="edit" eventId={event.id} initial={initial} availablePractices={availablePractices} />
        </div>

        <TeacherManager eventId={event.id} initialTeachers={initialTeachers} />

        {hasSegments ? (
          <section className="mt-6 rounded-[1.75rem] border border-white/80 bg-white/70 p-5 shadow-[0_18px_55px_rgba(106,75,25,0.08)]">
            <h3 className="font-serif text-2xl text-slate-950">Session schedule</h3>
            <p className="mt-1 text-sm text-slate-600">
              Read-only here. Contact an admin to update the schedule.
            </p>
            <ul className="mt-4 space-y-2">
              {segments.map((segment, i) => (
                <li key={i} className="rounded-2xl border border-(--color-sand-strong) bg-(--color-mist) p-3 text-sm">
                  <p className="font-semibold text-slate-900">{segment.title ?? `Segment ${i + 1}`}</p>
                  {segment.teachers?.length ? (
                    <p className="mt-1 text-slate-600">
                      {segment.teachers
                        .map((t) => (typeof t === "string" ? t : t?.name ?? ""))
                        .filter(Boolean)
                        .join(", ")}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </main>
  );
}
