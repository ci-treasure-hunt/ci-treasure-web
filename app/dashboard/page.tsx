import Link from "next/link";
import { redirect } from "next/navigation";

import { isAdminEmail } from "@/lib/admin-auth";
import { RemoveMeButton } from "@/components/organizer/remove-me-button";
import { buildEventSlug } from "@/lib/events";
import { createClient } from "@/lib/supabase/server";

type DashboardEvent = {
  id: string;
  short_id: string;
  title: string;
  start_date: string | null;
  end_date: string | null;
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

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // proxy.ts already guards this route, but never render dashboard without a session.
  if (!user) {
    redirect("/auth?next=/dashboard");
  }

  const isAdmin = await isAdminEmail(user.email);

  // Profile this user owns (claim approved, or self-created).
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, name, slug, is_trusted, source, visibility")
    .eq("user_id", user.id)
    .maybeSingle();

  // Middle state: a claim submitted but not yet approved by an admin.
  const { data: pendingClaim } = await supabase
    .from("profiles")
    .select("name")
    .eq("claim_pending_user_id", user.id)
    .maybeSingle();

  // Same middle state for event claims (I-118) — profiles has one pending-claim column to
  // check, event_claims is a separate table since a user can have several pending at once.
  const { data: pendingEventClaims } = await supabase
    .from("event_claims")
    .select("role, events(title)")
    .eq("user_id", user.id)
    .eq("status", "pending");

  // Scope explicitly to events this user submitted or is linked to.
  let organizeEvents: DashboardEvent[] = [];
  let teachEvents: DashboardEvent[] = [];
  let musicEvents: DashboardEvent[] = [];

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
      .select("id, short_id, title, start_date, end_date, status, admin_notes")
      .or(orgOrFilter)
      .order("start_date", { ascending: true });
    organizeEvents = (orgRows ?? []) as DashboardEvent[];

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
        .select("id, short_id, title, start_date, end_date, status, admin_notes")
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
        .select("id, short_id, title, start_date, end_date, status, admin_notes")
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
            <h2 className="font-serif text-2xl text-slate-950">Find your profile</h2>
            <p className="mt-3 text-base leading-7 text-slate-700">
              To manage events, tell us whether you&apos;re already listed here or you&apos;re new.
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
                    Submit a new event
                  </Link>
                </div>
              </div>

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
      </div>
    </main>
  );
}

function EventList({ events, teacherId }: { events: DashboardEvent[]; teacherId?: string }) {
  return (
    <ul className="mt-6 divide-y divide-(--color-sand-strong)">
      {events.map((event) => (
        <li key={event.id} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold text-slate-950">{event.title}</p>
            <p className="text-sm text-slate-600">
              {event.start_date ?? "—"}
              {event.end_date && event.end_date !== event.start_date ? ` – ${event.end_date}` : ""}
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
