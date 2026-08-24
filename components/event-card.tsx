import Link from "next/link";
import { CalendarDays, MapPin } from "lucide-react";

import { formatEventDateRange, getCountryLabel, getEventHref, getTypeLabel, type EventListItem } from "@/lib/event-display";
import { getMediumUrl, getSmallUrl, toCdnUrl } from "@/lib/image-url";

export function EventCard({ event, compact = false }: { event: EventListItem; compact?: boolean }) {
  const imageUrl = event.imageUrl?.trim() ?? "";
  const renderImage = imageUrl.length > 0;

  if (compact) {
    return (
      <Link
        href={getEventHref(event)}
        className="group block overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition hover:shadow-md"
      >
        <article className="flex items-start gap-3 p-3">
          <div className={`h-12 w-12 shrink-0 rounded-md border border-(--color-sand-strong) overflow-hidden ${!renderImage ? event.accentClass : ""}`}>
            {renderImage && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={toCdnUrl(getSmallUrl(imageUrl))} alt={event.title} className="h-full w-full object-cover" />
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="flex items-center gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-(--color-pine)">
                {getTypeLabel(event.type)}
              </p>
              {event.cancelled && (
                <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-700">
                  Cancelled
                </span>
              )}
            </div>
            <h2 className="truncate font-serif text-sm font-semibold leading-snug text-slate-950">{event.title}</h2>
            <p className="text-xs text-slate-500">{formatEventDateRange(event)}</p>
            {/* slate-500, not slate-400: slate-400 measured 2.63:1 on white, below WCAG's 4.5:1 minimum */}
            <p className="text-xs text-slate-500">{event.city}, {getCountryLabel(event.country)}</p>
          </div>
        </article>
      </Link>
    );
  }

  return (
    <Link
      href={getEventHref(event)}
      className="group block overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition hover:shadow-md"
    >
      <article>
        {renderImage ? (
          <div className="relative h-44 border-b border-(--color-sand-strong)">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={toCdnUrl(getMediumUrl(imageUrl))} alt={event.title} className="h-full w-full object-cover" />
          </div>
        ) : (
          <div className={`h-44 border-b border-(--color-sand-strong) ${event.accentClass}`} />
        )}
        <div className="space-y-5 p-5">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-(--color-pine)">
                {getTypeLabel(event.type)}
              </p>
              {event.cancelled && (
                <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-rose-700">
                  Cancelled
                </span>
              )}
            </div>
            <h2 className="font-serif text-2xl leading-tight text-slate-950">{event.title}</h2>
            {event.description ? (
              <p className="line-clamp-3 text-sm leading-7 text-slate-600">{event.description}</p>
            ) : null}
          </div>

          <dl className="space-y-2 text-sm text-slate-600">
            <div className="flex items-start gap-2">
              <CalendarDays className="mt-0.5 size-4 text-(--color-pine)" />
              <dd>{formatEventDateRange(event)}</dd>
            </div>
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 size-4 text-(--color-pine)" />
              <dd>
                {event.city}, {getCountryLabel(event.country)}
              </dd>
            </div>
          </dl>
        </div>
      </article>
    </Link>
  );
}
