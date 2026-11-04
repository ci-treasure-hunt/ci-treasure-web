import Link from "next/link";
import { redirect } from "next/navigation";

import { isAdminEmail } from "@/lib/admin-auth";
import { RemoveMeButton } from "@/components/organizer/remove-me-button";
import { findClaimSuggestion, type ClaimSuggestion } from "@/lib/claim-suggestion";
import { buildEventSlug } from "@/lib/events";
import { formatEventDateRange, getCountryLabel } from "@/lib/event-display";
import { fbGroupsForEvent, type FbGroup } from "@/lib/fb-groups";
import { FbGroupLinks } from "@/components/fb-group-links";
import { getManageableSeriesIds } from "@/lib/series-access";
import { supportHref } from "@/lib/support";

import { completeSignupOptin, needsNewsletterConfirmation, newsletterState } from "./newsletter";
import { NewsletterOffer } from "./newsletter-offer";
import { NewsletterReminder } from "./newsletter-reminder";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type DashboardEvent = {
  id: string;
  short_id: string;
  title: string;
  start_date: string | null;
  end_date: string | null;
  city: string | null;
  country: string | null;
  cancelled: boolean | null;
  status: string;
  admin_notes: string | null;
};

const STATUS_STYLES: Record<string, string> = {
  published: "bg-emerald-100 text-emerald-800",
  pending: "bg-amber-100 text-amber-800",
  draft: "bg-slate-100 text-slate-700",
  rejected: "bg-rose-100 text-rose-800",
  cancelled: "bg-rose-100 text-rose-800",
};

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? "bg-slate-100 text-slate-700";
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${style}`}>{status}</span>
  );
}

async function signOut() {
  "use server";
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/auth");
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ submitted?: string; event?: string }>;
}) {
  // Set by the event form after a new submission (components/organizer/event-form.tsx). The slug
  // only ever becomes a link to /events/<slug>, so a strict pattern is all the checking it needs.
  const { submitted, event: eventParam } = await searchParams;
  const submittedEventSlug = eventParam && /^[A-Za-z0-9-]{1,120}$/.test(eventParam) ? eventParam : null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // proxy.ts already guards this route, but never render dashboard without a session.
  if (!user) {
    redirect("/auth?next=/dashboard");
  }

  const isAdmin = await isAdminEmail(user.email);

  // I-160 rider: carry out the sign-up newsletter box now that the address is proven, else offer
  // it once. Not on the post-submission redirect, which already carries the support ask.
  const signupNewsletter = await completeSignupOptin(user);
  const showNewsletterOffer =
    !submitted && Boolean(user.email) && !newsletterState(user) && signupNewsletter === null;
  // Subscribed but never confirmed with EmailOctopus: remind on the site instead of by email.
  const showNewsletterReminder = !submitted && signupNewsletter === null && (await needsNewsletterConfirmation(user));

  // I-192: events this account passed on without organizing or teaching (event_submissions, no
  // role). Read with the admin client: event_submissions is service-role only, and a pending or
  // rejected event isn't readable through RLS by someone who doesn't own it. Scoped to user.id here.
  const sharedEvents = await loadSharedEvents(user.id);

  // Profile this user owns (claim approved, or self-created).
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, name, slug, is_trusted, source, visibility, bio, image_url, city, website, instagram, facebook, links")
    .eq("user_id", user.id)
    .maybeSingle();

  // Profile completeness nudge: what a visitor to their teacher page would miss, photo first
  // (35 of 48 claimed profiles had none on 2026-10-15). One ask at a time: not alongside the
  // post-submission note or the newsletter offer.
  const profileGaps = profile
    ? [
        !profile.image_url && "a photo",
        !profile.bio && "a short bio",
        !profile.city && "where you are based",
        !profile.website &&
          !profile.instagram &&
          !profile.facebook &&
          !(Array.isArray(profile.links) && profile.links.length) &&
          "a website or social link",
      ].filter((g): g is string => Boolean(g))
    : [];
  const showProfileNudge =
    !submitted && !showNewsletterOffer && !showNewsletterReminder && signupNewsletter !== "pending";

  // Middle state: a claim submitted but not yet approved by an admin.
  const { data: pendingClaim } = await supabase
    .from("profiles")
    .select("name")
    .eq("claim_pending_user_id", user.id)
    .maybeSingle();

  // "Is this you?" (I-074 follow-up): only while the user has neither a profile nor a claim.
  const claimSuggestion = !profile && !pendingClaim ? await findClaimSuggestion(user) : null;

  // Same middle state for event claims (I-118) — profiles has one pending-claim column to
  // check, event_claims is a separate table since a user can have several pending at once.
  const { data: pendingEventClaims } = await supabase
    .from("event_claims")
    .select("role, events(title)")
    .eq("user_id", user.id)
    .eq("status", "pending");

  // I-189: the Facebook groups this event fits (regional 2+ days, international 4+), shown with the
  // share line. Live submissions only; pending ones get the same list in the approval email.
  let submittedFbGroups: FbGroup[] = [];
  if (submitted === "live" && submittedEventSlug) {
    const { data: submittedEvent } = await supabase
      .from("events")
      .select("country, start_date, end_date")
      .eq("short_id", submittedEventSlug.split("-")[0])
      .maybeSingle();
    if (submittedEvent) {
      submittedFbGroups = fbGroupsForEvent({
        country: submittedEvent.country,
        startDate: submittedEvent.start_date,
        endDate: submittedEvent.end_date,
      });
    }
  }

  // Scope explicitly to events this user submitted or is linked to.
  let organizeEvents: DashboardEvent[] = [];
  let teachEvents: DashboardEvent[] = [];
  let musicEvents: DashboardEvent[] = [];
  let seriesList: SeriesSummary[] = [];

  if (profile) {
    // 1. Organise
    const { data: orgLinks } = await supabase
      .from("event_organizers")
      .select("event_id")
      .eq("organizer_id", profile.id);
    const orgIds = (orgLinks ?? []).map((r) => r.event_id as string);
    const orgOrFilter = orgIds.length
      ? `user_id.eq.${user.id},id.in.(${orgIds.join(",")})`
      : `user_id.eq.${user.id}`;
    const { data: orgRows } = await supabase
      .from("events")
      .select("id, short_id, title, start_date, end_date, city, country, cancelled, status, admin_notes")
      .or(orgOrFilter)
      .order("start_date", { ascending: true });
    organizeEvents = (orgRows ?? []) as DashboardEvent[];

    // I-171: repeating jams and classes, each with its own page to add more dates.
    const seriesIds = await getManageableSeriesIds(supabase, user.id, profile.id);
    if (seriesIds.length) {
      const { data: seriesRows } = await supabase
        .from("event_series")
        .select("id, title")
        .in("id", seriesIds);
      const { data: seriesDates } = await supabase
        .from("events")
        .select("series_id, start_date, end_date, city, country, cancelled")
        .in("series_id", seriesIds);
      seriesList = summarizeSeries(seriesRows ?? [], (seriesDates ?? []) as SeriesDateRow[]);
    }

    // 2. Teach
    const { data: teachLinks } = await supabase
      .from("event_teachers")
      .select("event_id")
      .eq("teacher_id", profile.id)
      .not("role", "eq", "musician");
    const teachIds = (teachLinks ?? []).map((r) => r.event_id as string);
    if (teachIds.length > 0) {
      const { data: teachRows } = await supabase
        .from("events")
        .select("id, short_id, title, start_date, end_date, city, country, cancelled, status, admin_notes")
        .in("id", teachIds)
        .order("start_date", { ascending: true });
      teachEvents = (teachRows ?? []) as DashboardEvent[];
    }

    // 3. Music
    const { data: musicLinks } = await supabase
      .from("event_teachers")
      .select("event_id")
      .eq("teacher_id", profile.id)
      .eq("role", "musician");
    const musicIds = (musicLinks ?? []).map((r) => r.event_id as string);
    if (musicIds.length > 0) {
      const { data: musicRows } = await supabase
        .from("events")
        .select("id, short_id, title, start_date, end_date, city, country, cancelled, status, admin_notes")
        .in("id", musicIds)
        .order("start_date", { ascending: true });
      musicEvents = (musicRows ?? []) as DashboardEvent[];
    }
  }

  return (
    <main className="min-h-screen bg-(--color-mist) px-5 py-6 text-slate-900 sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="flex flex-col gap-4 rounded-[1.75rem] border border-white/80 bg-white/85 p-5 shadow-[0_18px_55px_rgba(106,75,25,0.08)] sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-(--color-pine)">Your dashboard</p>
            <h1 className="mt-2 font-serif text-3xl text-slate-950">
              {profile ? profile.name : "Welcome"}
            </h1>
            <p className="mt-1 text-sm text-slate-600">{user.email}</p>
          </div>
          <div className="flex flex-wrap gap-3 text-sm font-medium">
            {profile && (
              <Link
                href="/dashboard/profile/edit"
                className="rounded-full border border-(--color-sand-strong) px-4 py-2 text-slate-700 hover:border-(--color-pine) hover:text-(--color-pine)"
              >
                Edit profile
              </Link>
            )}
            {isAdmin ? (
              <Link
                href="/admin/events"
                className="rounded-full border border-(--color-sand-strong) px-4 py-2 text-slate-700 hover:border-(--color-pine) hover:text-(--color-pine)"
              >
                Admin
              </Link>
            ) : null}
            <form action={signOut}>
              <button
                type="submit"
                className="rounded-full border border-(--color-sand-strong) px-4 py-2 text-slate-700 hover:border-(--color-pine) hover:text-(--color-pine)"
              >
                Sign out
              </button>
            </form>
          </div>
        </header>

        {signupNewsletter === "pending" ? (
          <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-800">
            Thanks for subscribing to the newsletter! We sent an email to {user.email}. Click the button in it to
            confirm.
          </p>
        ) : null}
        {showNewsletterOffer ? <NewsletterOffer email={user.email!} /> : null}
        {showNewsletterReminder ? <NewsletterReminder email={user.email!} /> : null}

        {!profile && pendingClaim ? (
          <section className="rounded-[1.75rem] border border-white/80 bg-white/90 p-8 shadow-[0_18px_55px_rgba(106,75,25,0.08)]">
            <h2 className="font-serif text-2xl text-slate-950">Claim pending review</h2>
            <p className="mt-3 text-base leading-7 text-slate-700">
              Your claim for <span className="font-semibold">{pendingClaim.name}</span> is waiting for an admin to
              review it. You&apos;ll get an email once it&apos;s approved, and then you can manage your events here.
              This usually takes a day or two.
            </p>
          </section>
        ) : !profile ? (
          <section className="rounded-[1.75rem] border border-white/80 bg-white/90 p-8 shadow-[0_18px_55px_rgba(106,75,25,0.08)]">
            {claimSuggestion ? <ClaimSuggestionCard suggestion={claimSuggestion} /> : null}
            <h2 className={`font-serif text-2xl text-slate-950${claimSuggestion ? " mt-8" : ""}`}>
              {claimSuggestion ? "Not you?" : "Find your profile"}
            </h2>
            <p className="mt-3 text-base leading-7 text-slate-700">
              To manage events, tell us whether you&apos;re already listed here or you&apos;re new.
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Just passing events on? You don&apos;t need a profile for that:{" "}
              <Link href="/events/new" className="font-semibold text-(--color-pine) underline">
                add an event
              </Link>
              , and it shows up below.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/dashboard/claim"
                className="rounded-full bg-(--color-ink) px-5 py-3 text-sm font-semibold text-(--color-mist)"
              >
                There&apos;s already a profile of me
              </Link>
              <Link
                href="/dashboard/new-profile"
                className="rounded-full border border-(--color-sand-strong) px-5 py-3 text-sm font-semibold text-slate-700 hover:border-(--color-pine) hover:text-(--color-pine)"
              >
                There&apos;s no profile of me yet
              </Link>
            </div>
          </section>
        ) : (
          <div className="flex flex-col gap-6">
            {submitted === "live" || submitted === "review" ? (
              <SubmittedThanks live={submitted === "live"} eventSlug={submittedEventSlug} fbGroups={submittedFbGroups} />
            ) : null}

            {profileGaps.length && showProfileNudge ? <ProfileGaps gaps={profileGaps} /> : null}

            {profile.source === "self_submitted" && profile.visibility === "shadow" ? (
              <section className="rounded-[1.75rem] border border-amber-200 bg-amber-50 p-6">
                <h2 className="font-serif text-xl text-slate-950">Your profile is in review</h2>
                <p className="mt-2 text-sm text-slate-700">
                  You can use your dashboard now, but your profile won&apos;t appear in the public directory until
                  an admin reviews it. This usually takes a day or two.
                </p>
              </section>
            ) : null}

            {pendingEventClaims && pendingEventClaims.length > 0 ? (
              <section className="rounded-[1.75rem] border border-amber-200 bg-amber-50 p-6">
                <h2 className="font-serif text-xl text-slate-950">Event claims pending review</h2>
                <ul className="mt-3 space-y-1 text-sm text-slate-700">
                  {pendingEventClaims.map((claim, i) => {
                    const event = claim.events as unknown as { title: string } | null;
                    return (
                      <li key={i}>
                        {event?.title ?? "(event)"} — as <span className="capitalize">{claim.role}</span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}

            <section className="rounded-[1.75rem] border border-white/80 bg-white/90 p-6 shadow-[0_18px_55px_rgba(106,75,25,0.08)]">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="font-serif text-2xl text-slate-950">Events you organize</h2>
                <div className="flex items-center gap-4">
                  {profile && (
                    <Link
                      href={`/teachers/${profile.slug}`}
                      className="text-sm font-medium text-(--color-pine) hover:underline"
                    >
                      View public profile →
                    </Link>
                  )}
                  <Link
                    href="/events/new"
                    className="rounded-full bg-(--color-ink) px-5 py-3 text-sm font-semibold text-(--color-mist)"
                  >
                    Add an event
                  </Link>
                  <Link href="/venues/new" className="text-sm font-medium text-(--color-pine) hover:underline">
                    Add a venue
                  </Link>
                </div>
              </div>

              {seriesList.length ? (
                <div className="mt-6 rounded-2xl border border-(--color-sand-strong) bg-(--color-mist) p-4">
                  <p className="text-sm font-semibold text-slate-800">Your repeating events</p>
                  <ul className="mt-2 space-y-2">
                    {seriesList.map((s) => (
                      <li key={s.id} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <span className="text-sm text-slate-700">
                          <span className="font-medium text-slate-900">{s.title}</span>
                          {s.details ? <span className="block text-slate-500">{s.details}</span> : null}
                        </span>
                        <Link
                          href={`/dashboard/series/${s.id}`}
                          className="self-start rounded-full border border-(--color-sand-strong) bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:border-(--color-pine) hover:text-(--color-pine)"
                        >
                          See all dates · add more
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {organizeEvents.length === 0 ? (
                <p className="mt-6 text-base leading-7 text-slate-600">
                  No events linked to your profile yet. Submit one with the button above.
                </p>
              ) : (
                <EventList events={organizeEvents} />
              )}
            </section>

            {teachEvents.length > 0 && (
              <section className="rounded-[1.75rem] border border-white/80 bg-white/90 p-6 shadow-[0_18px_55px_rgba(106,75,25,0.08)]">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <h2 className="font-serif text-2xl text-slate-950">Events you teach</h2>
                  {profile && (
                    <Link
                      href={`/teachers/${profile.slug}`}
                      className="text-sm font-medium text-(--color-pine) hover:underline"
                    >
                      View public profile →
                    </Link>
                  )}
                </div>
                <EventList events={teachEvents} teacherId={profile.id} />
              </section>
            )}

            {musicEvents.length > 0 && (
              <section className="rounded-[1.75rem] border border-white/80 bg-white/90 p-6 shadow-[0_18px_55px_rgba(106,75,25,0.08)]">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <h2 className="font-serif text-2xl text-slate-950">Events you play music for</h2>
                  {profile && (
                    <Link
                      href={`/teachers/${profile.slug}`}
                      className="text-sm font-medium text-(--color-pine) hover:underline"
                    >
                      View public profile →
                    </Link>
                  )}
                </div>
                <EventList events={musicEvents} teacherId={profile.id} />
              </section>
            )}
          </div>
        )}

        {sharedEvents.length > 0 ? <SharedEventList events={sharedEvents} /> : null}
      </div>
    </main>
  );
}

// I-173 option F: the support nudge sits here, right after a submission, because that is when
// someone has just been helped. It leads with "free, and it stays free" so it cannot read as
// paying for approval, and it only shows on the redirect, never on a normal dashboard visit.
function SubmittedThanks({ live, eventSlug, fbGroups }: { live: boolean; eventSlug: string | null; fbGroups: FbGroup[] }) {
  return (
    <section className="rounded-[1.75rem] border border-emerald-200 bg-emerald-50 p-6">
      <h2 className="font-serif text-xl text-slate-950">Thank you, your event is {live ? "live" : "in review"}!</h2>
      <p className="mt-2 text-sm leading-6 text-slate-700">
        {live
          ? "It is on the calendar now. You can still change anything with Edit below."
          : "We usually review new events within a day or two and email you when it is live."}
      </p>
      {/* Share kit: a live event's own link, so sharing is one copy away. Pending events get it in
          the approval email instead. */}
      {live && eventSlug ? (
        <p className="mt-3 text-sm leading-6 text-slate-700">
          Share it with your community, in your group chats and on social media, so more dancers find it:{" "}
          <Link href={`/events/${eventSlug}`} className="font-semibold text-(--color-pine) underline">
            citreasurehunt.com/events/{eventSlug}
          </Link>
        </p>
      ) : null}
      {live ? (
        <FbGroupLinks lead={`You can also post it in our Facebook ${fbGroups.length > 1 ? "groups" : "group"}:`} groups={fbGroups} className="mt-3 text-slate-700" />
      ) : null}
      <p className="mt-3 text-sm leading-6 text-slate-700">
        Listing events here is free, and it stays free. I build and run CI Treasure Hunt on my own, so if it
        helps you reach dancers, a small monthly contribution keeps it going.
      </p>
      <a
        href={supportHref("submit")}
        target="_blank"
        rel="noreferrer"
        className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-yellow-100 px-4 py-2 text-sm font-semibold text-yellow-800 transition hover:bg-yellow-200"
      >
        Support CI Treasure Hunt ❤️
      </a>
    </section>
  );
}

function ProfileGaps({ gaps }: { gaps: string[] }) {
  const list = gaps.length === 1 ? gaps[0] : `${gaps.slice(0, -1).join(", ")} and ${gaps[gaps.length - 1]}`;
  return (
    <section className="flex flex-col gap-3 rounded-[1.75rem] border border-(--color-sand-strong) bg-white/90 p-6 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="font-serif text-xl text-slate-950">Complete your profile</h2>
        <p className="mt-1 text-sm leading-6 text-slate-700">
          Your teacher page is still missing {list}. Dancers who find your events look there first.
        </p>
      </div>
      <Link
        href="/dashboard/profile/edit"
        className="shrink-0 self-start rounded-full bg-(--color-ink) px-5 py-2.5 text-sm font-semibold text-(--color-mist) sm:self-center"
      >
        Edit profile
      </Link>
    </section>
  );
}

// "Your repeating events": two series with the same title (Eric's labs in India and on Koh Phangan,
// feedback 2026-10-28) looked identical with the title alone. Each line now carries place, date
// range and number of dates, and the list runs by next date instead of alphabetically.
type SeriesSummary = { id: string; title: string; details: string; sortKey: string };
type SeriesDateRow = {
  series_id: string | null;
  start_date: string | null;
  end_date: string | null;
  city: string | null;
  country: string | null;
  cancelled: boolean | null;
};

function summarizeSeries(series: Array<{ id: string; title: string }>, rows: SeriesDateRow[]): SeriesSummary[] {
  const today = new Date().toISOString().slice(0, 10);
  return series
    .map((s) => {
      const dates = rows.filter((r) => r.series_id === s.id && r.start_date && !r.cancelled);
      const starts = dates.map((r) => r.start_date as string).sort();
      const ends = dates.map((r) => (r.end_date ?? r.start_date) as string).sort();
      const places = [
        ...new Set(dates.map((r) => [r.city, r.country ? getCountryLabel(r.country) : null].filter(Boolean).join(", "))),
      ].filter(Boolean);
      const next = starts.find((d) => d >= today);
      const parts: string[] = [];
      if (places.length) parts.push(places.length === 1 ? places[0] : `${places[0]} and ${places.length - 1} more`);
      if (starts.length) {
        parts.push(formatEventDateRange({ startDate: starts[0], endDate: ends[ends.length - 1] }));
        parts.push(`${starts.length} ${starts.length === 1 ? "date" : "dates"}`);
      }
      if (next && next !== starts[0]) parts.push(`next ${formatEventDateRange({ startDate: next, endDate: next })}`);
      // Upcoming series first, by next date; finished ones after, newest first.
      const sortKey = next ? `0${next}` : `1${String(99999999 - Number((starts[starts.length - 1] ?? "0").replaceAll("-", "")))}`;
      return { id: s.id, title: s.title, details: parts.join(" · "), sortKey };
    })
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey) || a.title.localeCompare(b.title));
}

function EventList({ events, teacherId }: { events: DashboardEvent[]; teacherId?: string }) {
  return (
    <ul className="mt-6 divide-y divide-(--color-sand-strong)">
      {events.map((event) => (
        <li key={event.id} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold text-slate-950">{event.title}</p>
            {/* Readable date plus place: an organizer with several dates of the same title (two
                series in two countries, Eric's feedback 2026-10-28) tells them apart here. */}
            <p className="text-sm text-slate-600">
              {event.start_date
                ? formatEventDateRange({ startDate: event.start_date, endDate: event.end_date ?? event.start_date })
                : "—"}
              {event.city || event.country
                ? ` · ${[event.city, event.country ? getCountryLabel(event.country) : null].filter(Boolean).join(", ")}`
                : ""}
              {event.cancelled ? <span className="ml-2 font-semibold text-rose-700">Cancelled</span> : null}
            </p>
            {event.status === "rejected" && event.admin_notes ? (
              <p className="mt-1 text-sm text-rose-700">Note: {event.admin_notes}</p>
            ) : null}
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={event.status} />
            {teacherId && <RemoveMeButton eventId={event.id} teacherId={teacherId} />}
            <Link
              href={`/events/${buildEventSlug(event.short_id, event.title)}/edit`}
              className="rounded-full border border-(--color-sand-strong) px-4 py-2 text-sm font-medium text-slate-700 hover:border-(--color-pine) hover:text-(--color-pine)"
            >
              Edit
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}

function ClaimSuggestionCard({ suggestion }: { suggestion: ClaimSuggestion }) {
  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
      <h2 className="font-serif text-2xl text-slate-950">Is this you?</h2>
      <p className="mt-2 text-sm text-slate-700">
        {suggestion.reason === "email"
          ? "We have a profile listed with the email address you signed in with."
          : "We have a profile listed with the name on your Google account."}
      </p>
      <div className="mt-4 rounded-xl bg-white px-4 py-3">
        <a
          href={`/teachers/${suggestion.slug}`}
          target="_blank"
          rel="noreferrer"
          className="font-semibold text-slate-950 underline decoration-(--color-sand-strong) underline-offset-4 hover:text-(--color-pine)"
        >
          {suggestion.name}
        </a>
        <p className="mt-1 text-sm text-slate-600">
          {[suggestion.roles, suggestion.place].filter(Boolean).join(" · ")}
        </p>
      </div>
      <Link
        href={`/dashboard/claim?profile=${suggestion.id}`}
        className="mt-4 inline-block rounded-full bg-(--color-ink) px-5 py-3 text-sm font-semibold text-(--color-mist)"
      >
        Yes, this is me
      </Link>
    </div>
  );
}

// ── I-192: "Events you passed on" ─────────────────────────────────────────────────────────────
// What a volunteer (or anyone signed in) sent in without organizing or teaching it: read-only,
// with where it stands. A repeating event is one line with its number of dates.

type SharedEvent = {
  key: string;
  title: string;
  slug: string;
  startDate: string | null;
  endDate: string | null;
  place: string;
  status: string;
  dates: number;
};

async function loadSharedEvents(userId: string): Promise<SharedEvent[]> {
  const admin = createAdminClient();
  const { data: submissions } = await admin
    .from("event_submissions")
    .select("event_id, roles")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(200);
  const ids = (submissions ?? []).filter((r) => !(r.roles as string[] | null)?.length).map((r) => r.event_id as string);
  if (!ids.length) return [];

  const { data: rows } = await admin
    .from("events")
    .select("id, short_id, title, start_date, end_date, city, country, status, series_id")
    .in("id", ids)
    .order("start_date", { ascending: false });

  // Siblings of a repeating event (dates created by the same submission share series_id).
  const seriesIds = [...new Set((rows ?? []).map((r) => r.series_id as string | null).filter(Boolean))] as string[];
  const { data: siblings } = seriesIds.length
    ? await admin.from("events").select("series_id, start_date, end_date, status").in("series_id", seriesIds)
    : { data: [] };

  const seen = new Set<string>();
  const list: SharedEvent[] = [];
  for (const row of rows ?? []) {
    const key = (row.series_id as string | null) ?? (row.id as string);
    if (seen.has(key)) continue;
    seen.add(key);
    const group = row.series_id ? (siblings ?? []).filter((x) => x.series_id === row.series_id) : [row];
    const starts = group.map((x) => x.start_date as string).filter(Boolean).sort();
    const ends = group.map((x) => (x.end_date ?? x.start_date) as string).filter(Boolean).sort();
    list.push({
      key,
      title: row.title as string,
      slug: buildEventSlug(row.short_id as string, row.title as string),
      startDate: starts[0] ?? null,
      endDate: ends[ends.length - 1] ?? null,
      place: [row.city, row.country ? getCountryLabel(row.country as string) : null].filter(Boolean).join(", "),
      // Any date live means the event is live.
      status: group.some((x) => x.status === "published") ? "published" : (row.status as string),
      dates: group.length,
    });
  }
  return list;
}

// Plain words for someone who doesn't manage the event.
const SHARED_STATUS: Record<string, { label: string; style: string }> = {
  pending: { label: "In review", style: "bg-amber-100 text-amber-800" },
  published: { label: "Live", style: "bg-emerald-100 text-emerald-800" },
  archived: { label: "Past", style: "bg-slate-100 text-slate-700" },
  rejected: { label: "Not listed", style: "bg-rose-100 text-rose-800" },
};

function SharedEventList({ events }: { events: SharedEvent[] }) {
  const live = events.filter((e) => e.status === "published").length;
  return (
    <section className="rounded-[1.75rem] border border-white/80 bg-white/90 p-6 shadow-[0_18px_55px_rgba(106,75,25,0.08)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-serif text-2xl text-slate-950">Events you passed on</h2>
          <p className="mt-1 text-sm text-slate-600">
            {events.length} {events.length === 1 ? "event" : "events"}
            {live ? `, ${live} live` : ""}. Thank you! We check each one, add the details and publish it.
          </p>
        </div>
        <Link
          href="/events/new"
          className="self-start rounded-full border border-(--color-sand-strong) px-4 py-2 text-sm font-medium text-slate-700 hover:border-(--color-pine) hover:text-(--color-pine)"
        >
          Add another
        </Link>
      </div>
      <ul className="mt-6 divide-y divide-(--color-sand-strong)">
        {events.map((event) => {
          const status = SHARED_STATUS[event.status] ?? { label: event.status, style: "bg-slate-100 text-slate-700" };
          return (
            <li key={event.key} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                {event.status === "published" || event.status === "archived" ? (
                  <Link href={`/events/${event.slug}`} className="font-semibold text-slate-950 hover:text-(--color-pine) hover:underline">
                    {event.title}
                  </Link>
                ) : (
                  <p className="font-semibold text-slate-950">{event.title}</p>
                )}
                <p className="text-sm text-slate-600">
                  {event.startDate
                    ? formatEventDateRange({ startDate: event.startDate, endDate: event.endDate ?? event.startDate })
                    : "—"}
                  {event.dates > 1 ? ` · ${event.dates} dates` : ""}
                  {event.place ? ` · ${event.place}` : ""}
                </p>
              </div>
              <span className={`self-start rounded-full px-3 py-1 text-xs font-semibold sm:self-auto ${status.style}`}>
                {status.label}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
