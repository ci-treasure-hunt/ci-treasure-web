import { CalendarDays } from "lucide-react";

import { EventCard } from "@/components/event-card";
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
          {events.length > 0 && (
            <div className="flex justify-start gap-8 bg-white px-6 py-4 text-sm font-medium text-slate-700 sm:px-8">
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
        </header>

        {error && <p className="mb-6 text-sm text-rose-600">{error}</p>}

        {!error && events.length === 0 && (
          <p className="text-slate-600">
            No upcoming {config.label.toLowerCase()} listed right now. Check back soon, or{" "}
            <a href="/newsletter" className="underline hover:text-slate-800">
              subscribe to the newsletter
            </a>{" "}
            to hear about new ones.
          </p>
        )}

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((event) => (
            <div key={event.id} className="flex flex-col gap-1.5">
              <EventCard event={event} />
              {event.seriesExtraDates ? (
                <p className="px-1 text-xs text-slate-500">
                  Recurring: {event.seriesExtraDates} more upcoming{" "}
                  {event.seriesExtraDates === 1 ? "date" : "dates"} on the event page
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
