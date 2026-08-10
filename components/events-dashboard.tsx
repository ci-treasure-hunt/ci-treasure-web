"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Search, Map, List, X, Filter } from "lucide-react";

import { EventCard } from "./event-card";
import { BackToTopButton } from "./back-to-top-button";
import { Button } from "./ui/button";
import { disciplineLabel, getCountryLabel, getTypeLabel, type EventListItem } from "@/lib/event-display";
import { TELEGRAM_URL } from "@/lib/site";
import { CONTINENT_COUNTRIES, CONTINENT_LABELS } from "@/lib/continents";

// Dynamically load the Map component without SSR to avoid 'window is not defined' errors
const EventMap = dynamic(() => import("./map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-400">
      <div className="flex flex-col items-center gap-2">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-violet-500 border-t-transparent"></div>
        <p className="text-sm font-medium">Loading Interactive Map...</p>
      </div>
    </div>
  ),
});

type EventsDashboardProps = {
  events: EventListItem[];
};


export function EventsDashboard({ events }: EventsDashboardProps) {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Search query: local state only (client-side filtering, no URL round-trip per keystroke)
  const [searchQuery, setSearchQuery] = useState("");

  // Other filters live in the URL so the back button restores them
  const selectedCountry = searchParams.get("country") ?? "";
  const selectedType = searchParams.get("type") ?? "";
  const selectedMonth = searchParams.get("month") ?? "";
  const soonOnly = searchParams.get("soon") === "1";

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    const qs = params.toString();
    router.replace(qs ? `/?${qs}` : "/", { scroll: false });
  }

  const setSelectedCountry = (v: string) => setParam("country", v);
  const setSelectedType = (v: string) => setParam("type", v);
  const setSelectedMonth = (v: string) => setParam("month", v);
  const setSoonOnly = (v: boolean) => setParam("soon", v ? "1" : "");

  // Keep sessionStorage in sync so the smart back button can return here with filters intact
  useEffect(() => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("lastEventsUrl", window.location.href);
    }
  }, [searchParams]);

  // Discipline: scope-defining, not a narrowing filter — CI pre-selected by default,
  // multi-select otherwise, "all" is a sentinel meaning no discipline filter at all.
  const disciplineParam = searchParams.get("discipline");
  const showAllDisciplines = disciplineParam === "all";
  const selectedDisciplines = useMemo(
    () =>
      showAllDisciplines
        ? []
        : disciplineParam
          ? disciplineParam.split(",").filter(Boolean)
          : ["contact_improvisation"],
    [showAllDisciplines, disciplineParam]
  );

  function toggleDiscipline(value: string) {
    const current = showAllDisciplines ? [] : selectedDisciplines;
    const next = current.includes(value) ? current.filter((d) => d !== value) : [...current, value];
    // Deselecting the last active chip falls back to "all" (show everything) rather
    // than silently reverting to the CI default — less surprising mid-exploration.
    setParam("discipline", next.length === 0 ? "all" : next.join(","));
  }

  // Interaction state
  const [highlightedEventId, setHighlightedEventId] = useState<string | null>(null);

  // Mobile view state: 'list' | 'map'
  const [mobileView, setMobileView] = useState<"list" | "map">("list");
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Leaflet is a ~145KB chunk. On desktop the map panel is visible immediately, so mount it
  // right away; on mobile it's hidden behind the "list"/"map" toggle by default, so defer
  // downloading/mounting it until the user actually asks for it (matches PageSpeed's flagged
  // "unused JavaScript" finding — mobile's default view never touched this code).
  const [shouldRenderMap, setShouldRenderMap] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)");
    // Can't compute this via a lazy useState initializer instead: window doesn't exist during
    // SSR, so the server-rendered and first-client-render values must both start false to
    // avoid a hydration mismatch — the effect correcting it post-mount is the actual fix, not
    // a workaround for one.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (mql.matches) setShouldRenderMap(true);
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) setShouldRenderMap(true);
    };
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  // Rendering all ~140 filtered events into the DOM on mount was the dominant contributor to
  // Total Blocking Time (confirmed via a CDP CPU profile, see I-136) — the map still gets every
  // event for its markers, only the card list itself is paginated. Resets to the first page
  // whenever the filtered set changes, so a new filter/search doesn't leave the count stranded
  // partway through the old result set.
  const EVENTS_PAGE_SIZE = 20;
  const [visibleEventCount, setVisibleEventCount] = useState(EVENTS_PAGE_SIZE);
  const listScrollRef = useRef<HTMLDivElement>(null);
  // Reset pagination whenever the filtered set actually changes — adjusted during render
  // (React's documented pattern for "reset state when a value changes") rather than in an
  // effect, so the reset lands in the same commit instead of costing an extra render pass.
  const [prevFilteredEvents, setPrevFilteredEvents] = useState<EventListItem[] | null>(null);

  const activeFilterCount = [selectedCountry, selectedType, selectedMonth, soonOnly ? "1" : ""].filter(Boolean).length;

  // Reset all filters
  const resetFilters = () => {
    router.replace("/", { scroll: false });
    setSearchQuery("");
    setHighlightedEventId(null);
  };

  // Helper: check if event is within next 14 days
  const isSoon = (startDateStr: string) => {
    try {
      const start = new Date(startDateStr);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const diffTime = start.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays >= 0 && diffDays <= 14;
    } catch {
      return false;
    }
  };

  // Extract unique countries from loaded events list for dropdown options
  const countryOptions = useMemo(() => {
    const countries = Array.from(new Set(events.map((e) => e.country)));
    return countries
      .map((c) => ({ value: c, label: getCountryLabel(c) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [events]);

  // Group country options by continent for the optgroup select
  const groupedCountryOptions = useMemo(() => {
    const groups = (["americas", "emea", "apac"] as const).map((key) => ({
      key,
      label: CONTINENT_LABELS[key],
      value: `__continent_${key}`,
      countries: countryOptions.filter((o) => CONTINENT_COUNTRIES[key].includes(o.value)),
    }));
    const placed = new Set(groups.flatMap((g) => g.countries.map((c) => c.value)));
    const ungrouped = countryOptions.filter((o) => !placed.has(o.value));
    return { groups: groups.filter((g) => g.countries.length > 0), ungrouped };
  }, [countryOptions]);

  // Extract unique types from loaded events list
  const typeOptions = useMemo(() => {
    const types = Array.from(new Set(events.map((e) => e.type)));
    return types
      .map((t) => ({ value: t, label: getTypeLabel(t) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [events]);

  // Discipline chip options — derived from whatever disciplines exist in the loaded
  // events (same pattern as country/type/month above), so a brand-new discipline tag
  // shows up as a new chip automatically once it clears the visibility threshold, with
  // zero code changes. contact_improvisation is always pinned first since it's the
  // default. Practices with too few events (< MIN_DISCIPLINE_COUNT) are dropped from the
  // chip row — a filter with 1-3 results isn't a useful browsing entry point — but stay
  // fully tagged/searchable via "All disciplines"; they reappear automatically once they
  // cross the threshold. Decided 2026-07-14.
  const MIN_DISCIPLINE_COUNT = 4;
  const disciplineOptions = useMemo(() => {
    const counts: Record<string, number> = {};
    events.forEach((e) => e.discipline.forEach((d) => { counts[d] = (counts[d] ?? 0) + 1; }));
    const rest = Object.keys(counts)
      .filter((d) => d !== "contact_improvisation" && counts[d] >= MIN_DISCIPLINE_COUNT)
      .sort((a, b) => disciplineLabel(a).localeCompare(disciplineLabel(b)));
    return "contact_improvisation" in counts ? ["contact_improvisation", ...rest] : rest;
  }, [events]);

  // Extract unique months from events for the month filter
  const monthOptions = useMemo(() => {
    const months = Array.from(new Set(events.map((e) => e.startDate.substring(0, 7))));
    return months.sort().map((m) => {
      const [year, month] = m.split("-");
      const label = new Date(Number(year), Number(month) - 1, 1).toLocaleString("en", { month: "long", year: "numeric" });
      return { value: m, label };
    });
  }, [events]);

  // Filter events locally on the client (blasing fast, updates map and list instantly)
  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      // 0. Discipline — skip entirely when "All disciplines" is active
      if (!showAllDisciplines && selectedDisciplines.length > 0) {
        if (!event.discipline.some((d) => selectedDisciplines.includes(d))) {
          return false;
        }
      }

      // 1. Search Query (matches title, description, city, country)
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const titleMatch = event.title?.toLowerCase().includes(query);
        const descMatch = event.description?.toLowerCase().includes(query);
        const cityMatch = event.city?.toLowerCase().includes(query);
        const countryMatch = getCountryLabel(event.country).toLowerCase().includes(query);
        if (!titleMatch && !descMatch && !cityMatch && !countryMatch) {
          return false;
        }
      }

      // 2. Country / Continent Match
      if (selectedCountry) {
        if (selectedCountry.startsWith("__continent_")) {
          const key = selectedCountry.slice("__continent_".length);
          if (!CONTINENT_COUNTRIES[key]?.includes(event.country)) return false;
        } else if (event.country !== selectedCountry) {
          return false;
        }
      }

      // 3. Event Type Match
      if (selectedType && event.type !== selectedType) {
        return false;
      }

      // 4. Month Match
      if (selectedMonth && !event.startDate.startsWith(selectedMonth)) {
        return false;
      }

      // 5. Happening Soon (next 14 days)
      if (soonOnly && !isSoon(event.startDate)) {
        return false;
      }

      return true;
    });
  }, [events, searchQuery, selectedCountry, selectedType, selectedMonth, soonOnly, selectedDisciplines, showAllDisciplines]);

  if (filteredEvents !== prevFilteredEvents) {
    setPrevFilteredEvents(filteredEvents);
    setVisibleEventCount(EVENTS_PAGE_SIZE);
  }

  const visibleEvents = useMemo(
    () => filteredEvents.slice(0, visibleEventCount),
    [filteredEvents, visibleEventCount]
  );

  const handleMarkerClick = (eventId: string) => {
    // The map plots every filtered event regardless of how many cards are currently loaded in
    // the list, so a clicked marker's card may not exist in the DOM yet. Expand the loaded page
    // (rounded up to a full page) to cover it before highlighting — the scroll itself happens in
    // the effect below, once React has actually committed the newly-revealed card.
    const index = filteredEvents.findIndex((e) => e.id === eventId);
    if (index >= visibleEventCount) {
      setVisibleEventCount(Math.ceil((index + 1) / EVENTS_PAGE_SIZE) * EVENTS_PAGE_SIZE);
    }
    setHighlightedEventId(eventId);
  };

  useEffect(() => {
    if (!highlightedEventId) return;
    const cardElement = document.getElementById(`event-card-${highlightedEventId}`);
    cardElement?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [highlightedEventId, visibleEventCount]);

  return (
    <div className="space-y-6">
      {/* Practice toggle (backed by the `discipline` column/state — user-facing word is
          "practice", chosen over "discipline"/"dance form" since it fits non-dance
          modalities like BMC too) — scope-defining (which universe of events you're
          browsing), not a narrowing filter like the ones below, so it's a separate strip
          rather than nested in "Extended filters", and deliberately has no caption label
          ("All practices" carries the meaning on its own). Contact Improvisation
          pre-selected; multi-select otherwise; options derived live from event data. */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <button
          onClick={() => setParam("discipline", "all")}
          className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
            showAllDisciplines ? "bg-violet-100 text-violet-700" : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          All practices
        </button>
        {disciplineOptions.map((d) => (
          <button
            key={d}
            onClick={() => toggleDiscipline(d)}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
              !showAllDisciplines && selectedDisciplines.includes(d)
                ? "bg-violet-100 text-violet-700"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            {disciplineLabel(d)}
          </button>
        ))}
      </div>

      {/* Search & Filter Toolbar */}
      <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
        <div className="flex flex-col gap-3 sm:flex-row">
          {/* Search bar */}
          <div className="relative flex-1">
            <Search className="absolute top-1/2 left-4 size-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by keyword, city, or country..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50/50 py-3 pr-4 pl-11 text-sm outline-none transition focus:border-violet-400 focus:bg-white focus:ring-2 focus:ring-violet-100"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute top-1/2 right-4 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="size-4" />
              </button>
            )}
          </div>

          {/* Mobile controls: Filters toggle + List/Map toggle */}
          <div className="flex gap-2 border-t border-slate-100 pt-3 sm:border-none sm:pt-0 lg:hidden">
            <button
              onClick={() => setFiltersOpen((o) => !o)}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
                filtersOpen || activeFilterCount > 0
                  ? "bg-violet-100 text-violet-700"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <Filter className="size-4" />
              Filters
              {activeFilterCount > 0 && !filtersOpen && (
                <span className="rounded-full bg-violet-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                  {activeFilterCount}
                </span>
              )}
            </button>
            <div className="flex flex-1">
              <button
                onClick={() => setMobileView("list")}
                className={`flex flex-1 items-center justify-center gap-2 py-2.5 text-sm font-semibold rounded-lg transition ${
                  mobileView === "list"
                    ? "bg-violet-100 text-violet-700"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <List className="size-4" />
                List
              </button>
              <button
                onClick={() => {
                  setMobileView("map");
                  setShouldRenderMap(true);
                }}
                className={`flex flex-1 items-center justify-center gap-2 py-2.5 text-sm font-semibold rounded-lg transition ${
                  mobileView === "map"
                    ? "bg-violet-100 text-violet-700"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <Map className="size-4" />
                Map
              </button>
            </div>
          </div>
        </div>

        {/* Extended filters — always visible on desktop, collapsed on mobile behind Filters button */}
        <div className={`flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 md:pt-4 ${filtersOpen ? "flex" : "hidden"} lg:flex`}>
          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
            {/* Country / Continent Selector */}
            <select
              aria-label="Filter by country"
              value={selectedCountry}
              onChange={(e) => setSelectedCountry(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100 sm:w-44"
            >
              <option value="">All Countries</option>
              {groupedCountryOptions.groups.map((group) => (
                <optgroup key={group.key} label={group.label}>
                  <option value={group.value}>All {group.label}</option>
                  {group.countries.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </optgroup>
              ))}
              {groupedCountryOptions.ungrouped.length > 0 && (
                <optgroup label="Other">
                  {groupedCountryOptions.ungrouped.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </optgroup>
              )}
            </select>

            {/* Type Selector */}
            <select
              aria-label="Filter by event type"
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100 sm:w-44"
            >
              <option value="">All Event Types</option>
              {typeOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            {/* Month Selector */}
            <select
              aria-label="Filter by month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100 sm:w-44"
            >
              <option value="">All Months</option>
              {monthOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            {/* Soon checkbox */}
            <label className="flex items-center gap-2 py-1 text-xs text-slate-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={soonOnly}
                onChange={(e) => setSoonOnly(e.target.checked as boolean)}
                className="rounded border-slate-300 text-violet-600 outline-none transition focus:ring-violet-500/20"
              />
              <span>Happening soon (14 days)</span>
            </label>
          </div>

          <div className="flex items-center gap-4 text-xs font-semibold text-slate-500 w-full justify-between sm:w-auto sm:justify-end border-t border-slate-50 pt-2 sm:border-none sm:pt-0">
            <span>
              {filteredEvents.length} of {events.length} events
            </span>
            {(searchQuery || selectedCountry || selectedType || selectedMonth || soonOnly) && (
              <button
                onClick={resetFilters}
                className="text-violet-600 hover:text-violet-800 transition"
              >
                Clear all filters
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Viewport Container */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-270px)] min-h-[500px]">
        {/* Event List (Left side on desktop - Col 5) */}
        <div
          className={`relative lg:col-span-4 h-full min-h-0 ${
            mobileView === "list" ? "block" : "hidden lg:block"
          }`}
        >
          <div ref={listScrollRef} className="h-full overflow-y-auto pr-1 space-y-3">
            {visibleEvents.length > 0 ? (
              <>
                {visibleEvents.map((event) => (
                  <div
                    key={event.id}
                    id={`event-card-${event.id}`}
                    className={`transition rounded-lg ${
                      highlightedEventId === event.id
                        ? "ring-2 ring-violet-500 ring-offset-2 scale-[0.99] shadow-sm"
                        : ""
                    }`}
                  >
                    <EventCard event={event} compact />
                  </div>
                ))}
                {visibleEventCount < filteredEvents.length && (
                  <div className="flex justify-center pt-2 pb-4">
                    <Button
                      onClick={() => setVisibleEventCount((c) => c + EVENTS_PAGE_SIZE)}
                      variant="outline"
                      size="sm"
                      className="border-violet-200 text-violet-600 hover:bg-violet-50"
                    >
                      Load more ({filteredEvents.length - visibleEventCount} remaining)
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white/75 px-6 py-16 text-center">
                <p className="font-serif text-xl text-slate-900 font-medium">No gatherings found matching filters.</p>
                <p className="mt-2 text-sm text-slate-500">
                  Try widening your parameters or clearing the search box.
                </p>
                <Button
                  onClick={resetFilters}
                  variant="outline"
                  size="sm"
                  className="mt-4 border-violet-200 text-violet-600 hover:bg-violet-50"
                >
                  Reset Filters
                </Button>
              </div>
            )}
          </div>
          <BackToTopButton containerRef={listScrollRef} />
        </div>

        {/* Map Panel (Right side on desktop - Col 7) */}
        <div
          className={`lg:col-span-8 h-full ${
            mobileView === "map" ? "block" : "hidden lg:block"
          }`}
        >
          {shouldRenderMap ? (
            <EventMap
              events={filteredEvents}
              highlightedEventId={highlightedEventId}
              onMarkerClick={handleMarkerClick}
              onReset={() => setHighlightedEventId(null)}
              visible={mobileView === "map"}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-400">
              <div className="flex flex-col items-center gap-2">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-violet-500 border-t-transparent"></div>
                <p className="text-sm font-medium">Loading Interactive Map...</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Is your event missing? */}
      <p className="rounded-xl border border-slate-200 bg-white px-6 py-5 text-center text-sm text-slate-600">
        Is your event missing?{" "}
        <a
          href={TELEGRAM_URL}
          target="_blank"
          rel="noreferrer"
          className="font-medium text-(--color-pine) underline decoration-(--color-pine)/35 underline-offset-4 transition hover:decoration-(--color-pine)"
        >
          Post it in our Telegram group
        </a>
        {" "}or email us at{" "}
        <a
          href="mailto:hello@citreasurehunt.com"
          className="font-medium text-(--color-pine) underline decoration-(--color-pine)/35 underline-offset-4 transition hover:decoration-(--color-pine)"
        >
          hello@citreasurehunt.com
        </a>
      </p>
    </div>
  );
}
