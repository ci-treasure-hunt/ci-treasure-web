import Link from "next/link";
import { CalendarDays } from "lucide-react";

import { EventCard } from "@/components/event-card";
import { FbGroupLinks } from "@/components/fb-group-links";
import { FB_INTERNATIONAL_GROUP, FB_REGIONAL_GROUPS, FB_REGION_PHRASE } from "@/lib/fb-groups";
import { getEventsByType, mapAccent } from "@/lib/events";
import type { EventTypePageConfig } from "@/lib/event-type-pages";

// Same Europe/Berlin "today" key used by the homepage (app/page.tsx's getTodayDateKey) —
// duplicated here rather than imported since it isn't exported there; centralized in this one
// shared component instead of five separate page files.
function getTodayDateKey() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

// I-189: which Facebook groups fit this type. Workshops run mostly 2-3 days (61% of listings since
// Nov 2025), so they belong in the regional groups; festivals, intensives, retreats and long jams
// are mostly 4+ days (96/92/83/67%), so the international group.
const WORKSHOP_FB_GROUPS = {
  lead: "Weekend workshops are also shared in our regional Facebook groups for",
  // Region names only: three full group titles in one sentence would run to four lines.
  groups: (["emea", "americas", "apac"] as const).map((r) => ({ ...FB_REGIONAL_GROUPS[r], name: FB_REGION_PHRASE[r] })),
};
const LONG_FORM_FB_GROUPS = {
  lead: "Events of 4 days or more are also shared in our Facebook group:",
  groups: [FB_INTERNATIONAL_GROUP],
};

export async function EventTypeListing({ config }: { config: EventTypePageConfig }) {
  const { events, error } = await getEventsByType(config.type, getTodayDateKey());
  const countryCount = new Set(events.map((e) => e.country)).size;

  return (
    <main className="min-h-screen bg-(--color-mist) px-5 py-10 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 overflow-hidden rounded-[2rem] border border-white/80 shadow-[0_25px_90px_rgba(105,73,22,0.12)]">
          {/* Same gradient-band pattern as /teachers/[slug] and /venues/[slug] — the type's
              accent color is otherwise invisible on this page, since EventCard only falls back
              to it when an event has no photo, and nearly every event here does. */}
          <div className={`flex min-h-52 flex-col justify-end px-6 py-8 sm:px-8 ${mapAccent(config.type)}`}>
            <div className="max-w-3xl space-y-3">
              <h1 className="font-serif text-4xl leading-tight tracking-tight text-white sm:text-5xl">
                {config.label} Worldwide
              </h1>
              <p className="max-w-2xl text-white/90">{config.intro}</p>
            </div>
          </div>
          {/* I-148: the guide link sits in this white bar rather than in the gradient hero, so the
              hero stays one clean statement of what the type is, and so a link never has to be
              styled against a colored background. The bar renders for the guide alone when there
              are no events, which is exactly when a reader has least else to do here. */}
          {(events.length > 0 || config.guide) && (
            <div className="flex flex-col gap-2 bg-white px-6 py-4 text-sm font-medium text-slate-700 sm:flex-row sm:items-center sm:justify-between sm:gap-8 sm:px-8">
              {events.length > 0 && (
                <div className="flex gap-8">
                  <span className="flex items-center gap-2">
                    <CalendarDays className="size-4 text-(--color-pine)" />
                    {events.length} upcoming {events.length === 1 ? "event" : "events"}
                  </span>
                  {countryCount > 0 && (
                    <span className="text-slate-500">
                      in {countryCount} {countryCount === 1 ? "country" : "countries"}
                    </span>
                  )}
                </div>
              )}
              {config.guide && (
                <Link
                  href={config.guide.href}
                  className="font-normal text-(--color-pine) hover:underline"
                >
                  {config.guide.label} →
                </Link>
              )}
            </div>
          )}
        </header>

        {error && <p className="mb-6 text-sm text-rose-600">{error}</p>}

        <FbGroupLinks {...(config.type === "workshop" ? WORKSHOP_FB_GROUPS : LONG_FORM_FB_GROUPS)} className="mb-6" />

        {!error && events.length === 0 && (
          <p className="text-slate-600">
            No upcoming {config.label.toLowerCase()} listed right now. Check back soon, or{" "}
            <Link href="/newsletter" className="underline hover:text-slate-800">
              subscribe to the newsletter
            </Link>{" "}
            to hear about new ones.
          </p>
        )}

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      </div>
    </main>
  );
}
