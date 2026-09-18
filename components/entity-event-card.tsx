import Link from "next/link";
import { ArrowLeft, CalendarDays, Clock3, MapPin } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  type EventListItem,
  formatCardTimeRange,
  formatEventDateRange,
  getEventHref,
  getEventLocation,
  getTypeLabel,
} from "@/lib/event-display";
import { getCountryFlag } from "@/lib/utils";

export function EntityEventCard({ event }: { event: EventListItem }) {
  const timeRange = formatCardTimeRange(event);
  return (
    <Link
      href={getEventHref(event)}
      className="group flex flex-col justify-between gap-4 rounded-2xl border border-(--color-sand-strong) bg-white p-5 transition hover:border-violet-300 hover:shadow-md sm:flex-row sm:items-center"
    >
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Badge
            variant="secondary"
            className="bg-violet-50 text-xs font-semibold uppercase tracking-wider text-violet-700"
          >
            {getTypeLabel(event.type)}
          </Badge>
          <span className="text-xs text-slate-500">{getCountryFlag(event.country)}</span>
        </div>
        <h4 className="font-serif text-xl font-bold text-slate-950 group-hover:text-violet-700 transition">
          {event.title}
        </h4>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
          <p className="flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5" />
            {formatEventDateRange(event)}
          </p>
          {timeRange ? (
            <p className="flex items-center gap-1.5">
              <Clock3 className="h-3.5 w-3.5" />
              {timeRange}
            </p>
          ) : null}
          <p className="flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5" />
            {getEventLocation(event)}
          </p>
        </div>
      </div>
      <div className="text-violet-600 opacity-0 transition group-hover:opacity-100 sm:block hidden">
        <ArrowLeft className="h-5 w-5 rotate-180" />
      </div>
    </Link>
  );
}
