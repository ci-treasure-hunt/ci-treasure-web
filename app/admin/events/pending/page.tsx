import Link from "next/link";

import { requireAdminUser } from "@/lib/admin-auth";

import { getPendingEvents, type PendingEvent } from "./actions";
import { EventReviewActions } from "./review-actions";

// A single pending event, or (I-171) all pending dates of one series, reviewed together.
type QueueItem =
  | { kind: "event"; event: PendingEvent }
  | { kind: "series"; id: string; title: string; dates: PendingEvent[] };

function groupQueue(events: PendingEvent[]): QueueItem[] {
  const items: QueueItem[] = [];
  const bySeries = new Map<string, Extract<QueueItem, { kind: "series" }>>();
  // events arrive sorted by start date, so each series card sits where its first date would.
  for (const event of events) {
    if (!event.series) {
      items.push({ kind: "event", event });
      continue;
    }
    const existing = bySeries.get(event.series.id);
    if (existing) {
      existing.dates.push(event);
      continue;
    }
    const item = { kind: "series" as const, id: event.series.id, title: event.series.title, dates: [event] };
    bySeries.set(event.series.id, item);
    items.push(item);
  }
  // A series with a single pending date reviews like any other event.
  return items.map((item) =>
    item.kind === "series" && item.dates.length === 1 ? { kind: "event", event: item.dates[0] } : item,
  );
}

function place(event: PendingEvent) {
  return [event.city, event.country].filter(Boolean).join(", ");
}

export default async function AdminPendingEventsPage() {
  await requireAdminUser();
  const events = await getPendingEvents();
  const queue = groupQueue(events);

  return (
    <section className="rounded-[1.75rem] border border-white/80 bg-white/90 p-6 shadow-[0_18px_55px_rgba(106,75,25,0.08)]">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-serif text-3xl text-slate-950">New events</h2>
          <p className="mt-1 text-sm text-slate-600">
            Organizer-submitted events awaiting review. Approving publishes and announces them. Trusting an
            organizer auto-publishes their future submissions. A repeating event shows as one card for all
            its pending dates.
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-800">
          {queue.length} to review
        </span>
      </div>

      {queue.length === 0 ? (
        <p className="mt-6 text-base text-slate-600">No pending events.</p>
      ) : (
        <ul className="mt-6 divide-y divide-(--color-sand-strong)">
          {queue.map((item) =>
            item.kind === "event" ? (
              <li key={item.event.id} className="flex flex-col gap-3 py-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="lg:pr-6">
                  <p className="font-semibold text-slate-950">{item.event.title}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {[item.event.startDate, place(item.event)].filter(Boolean).join(" · ")}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    Organizer: {item.event.organizer ? item.event.organizer.name : "— unlinked —"}
                  </p>
                  <Link
                    href={`/admin/events/pending/${item.event.id}/preview`}
                    className="mt-2 inline-block text-sm font-semibold text-(--color-pine) underline"
                  >
                    Preview full event →
                  </Link>
                </div>
                <EventReviewActions eventId={item.event.id} organizer={item.event.organizer} />
              </li>
            ) : (
              <li key={item.id} className="flex flex-col gap-3 py-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="lg:pr-6">
                  <p className="flex flex-wrap items-center gap-2 font-semibold text-slate-950">
                    {item.title}
                    <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-semibold text-violet-700">
                      Series · {item.dates.length} dates
                    </span>
                  </p>
                  <p className="mt-1 text-sm text-slate-600">{place(item.dates[0])}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    Organizer: {item.dates[0].organizer ? item.dates[0].organizer.name : "— unlinked —"}
                  </p>
                  <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm">
                    {item.dates.map((d) => (
                      <Link
                        key={d.id}
                        href={`/admin/events/pending/${d.id}/preview`}
                        className="font-medium text-(--color-pine) underline"
                        title={d.title}
                      >
                        {d.startDate}
                      </Link>
                    ))}
                  </p>
                  <Link
                    href={`/admin/series/${item.id}`}
                    className="mt-2 inline-block text-sm font-semibold text-(--color-pine) underline"
                  >
                    Open series →
                  </Link>
                </div>
                <EventReviewActions
                  eventId={item.dates[0].id}
                  organizer={item.dates[0].organizer}
                  series={{ id: item.id, count: item.dates.length }}
                />
              </li>
            ),
          )}
        </ul>
      )}
    </section>
  );
}
