"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X, Filter, BadgeCheck } from "lucide-react";

import type { ListedPerson } from "@/lib/teachers";
import { CONTINENT_COUNTRIES, CONTINENT_LABELS } from "@/lib/continents";
import { CompactTeacherRow } from "@/components/compact-entity-row";

// Two location states that aren't countries and can't be dropped from the filter. 15 people are
// nomadic (self-selected in their own dashboard, which is why the label matches the word they
// ticked) and 42 have no location on file at all — together ~12% of the directory, so a filter
// that silently omitted them would make one person in eight unreachable by browsing.
const NOMADIC = "__nomadic";
const NO_LOCATION = "__no_location";

type Props = {
  people: ListedPerson[];
  countries: Array<{ value: string; label: string }>;
};

export function TeachersClient({ people, countries }: Props) {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [searchQuery, setSearchQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const selectedCountry = searchParams.get("country") ?? "";
  const selectedRole = searchParams.get("role") ?? "";

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    const qs = params.toString();
    router.replace(qs ? `/teachers?${qs}` : "/teachers", { scroll: false });
  }

  const setSelectedCountry = (v: string) => setParam("country", v);
  const setSelectedRole = (v: string) => setParam("role", v);

  const activeFilterCount = [selectedCountry, selectedRole].filter(Boolean).length;

  const resetFilters = () => {
    router.replace("/teachers", { scroll: false });
    setSearchQuery("");
  };

  const groupedCountryOptions = useMemo(() => {
    const groups = (["americas", "emea", "apac"] as const).map((key) => ({
      key,
      label: CONTINENT_LABELS[key],
      value: `__continent_${key}`,
      countries: countries.filter((o) => CONTINENT_COUNTRIES[key].includes(o.value)),
    }));
    return groups.filter((g) => g.countries.length > 0);
  }, [countries]);

  const filtered = useMemo(() => {
    return people.filter((person) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const hit =
          person.name.toLowerCase().includes(q) ||
          person.city?.toLowerCase().includes(q) ||
          person.country?.toLowerCase().includes(q);
        if (!hit) return false;
      }

      if (selectedRole && !person.roles.includes(selectedRole)) return false;

      if (selectedCountry) {
        if (selectedCountry === NOMADIC) {
          if (!person.isNomadic) return false;
        } else if (selectedCountry === NO_LOCATION) {
          if (person.isNomadic || person.country) return false;
        } else if (selectedCountry.startsWith("__continent_")) {
          const key = selectedCountry.slice("__continent_".length);
          if (!person.country || !CONTINENT_COUNTRIES[key]?.includes(person.country)) return false;
        } else if (person.country !== selectedCountry) {
          return false;
        }
      }

      return true;
    });
  }, [people, searchQuery, selectedCountry, selectedRole]);

  const roleCounts = useMemo(
    () => ({
      teacher: people.filter((p) => p.roles.includes("teacher")).length,
      organizer: people.filter((p) => p.roles.includes("organizer")).length,
      musician: people.filter((p) => p.roles.includes("musician")).length,
    }),
    [people],
  );

  const nomadicCount = useMemo(() => people.filter((p) => p.isNomadic).length, [people]);
  const noLocationCount = useMemo(
    () => people.filter((p) => !p.isNomadic && !p.country).length,
    [people],
  );

  // Render-limiting "Load more" reveal, not real pagination (the full filtered set is already in
  // memory) — same pattern as /communities. 700+ rows rendered in one go was the open question
  // (2026-08-28); this keeps the initial paint small without a second network round trip.
  const PAGE_SIZE = 30;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [prevFiltered, setPrevFiltered] = useState(filtered);
  if (filtered !== prevFiltered) {
    setPrevFiltered(filtered);
    setVisibleCount(PAGE_SIZE);
  }
  const visiblePeople = filtered.slice(0, visibleCount);
  // Claimed profiles sort first (see lib/teachers.ts) but a small pill alone didn't make the
  // "why is this person first" question answerable at a glance — this caption plus the divider
  // below spell it out (2026-08-28 follow-up).
  const claimedInFiltered = useMemo(() => filtered.filter((p) => p.isClaimed).length, [filtered]);
  const claimedInVisible = visiblePeople.filter((p) => p.isClaimed).length;

  return (
    <>
      <div className="mb-8 flex flex-col gap-4 rounded-xl border border-(--color-sand-strong) bg-white p-4 shadow-sm md:p-5">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute top-1/2 left-4 size-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name, city, or country..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50/50 py-3 pr-4 pl-11 text-sm outline-none transition focus:border-violet-400 focus:bg-white focus:ring-2 focus:ring-violet-100"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute top-1/2 right-4 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                aria-label="Clear search"
              >
                <X className="size-4" />
              </button>
            )}
          </div>

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
                <span className="rounded-full bg-violet-600 px-1.5 py-0.5 text-[10px] leading-none font-bold text-white">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>
        </div>

        <div
          className={`flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 md:pt-4 ${
            filtersOpen ? "flex" : "hidden"
          } lg:flex`}
        >
          <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
            <select
              aria-label="Filter by country"
              value={selectedCountry}
              onChange={(e) => setSelectedCountry(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100 sm:w-52"
            >
              <option value="">All countries</option>
              {groupedCountryOptions.map((group) => (
                <optgroup key={group.key} label={group.label}>
                  <option value={group.value}>All {group.label}</option>
                  {group.countries.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </optgroup>
              ))}
              <optgroup label="Other">
                {nomadicCount > 0 && <option value={NOMADIC}>Nomadic ({nomadicCount})</option>}
                {noLocationCount > 0 && (
                  <option value={NO_LOCATION}>Location not listed ({noLocationCount})</option>
                )}
              </optgroup>
            </select>

            <select
              aria-label="Filter by role"
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100 sm:w-44"
            >
              <option value="">All roles</option>
              <option value="teacher">Teachers ({roleCounts.teacher})</option>
              <option value="organizer">Organizers ({roleCounts.organizer})</option>
              <option value="musician">Musicians ({roleCounts.musician})</option>
            </select>

            {activeFilterCount > 0 && (
              <button
                onClick={resetFilters}
                className="text-xs font-semibold text-slate-500 underline hover:text-slate-700"
              >
                Clear
              </button>
            )}
          </div>

          <div className="w-full border-t border-slate-50 pt-2 text-xs font-semibold text-slate-500 sm:w-auto sm:border-none sm:pt-0">
            {filtered.length} of {people.length} people
          </div>
        </div>
      </div>

      {filtered.length > 0 ? (
        <>
          {claimedInFiltered > 0 && (
            <p className="mb-2 flex items-center gap-1.5 text-xs text-slate-500">
              <BadgeCheck className="size-3.5 text-violet-600" />
              Claimed profiles, verified by their owner, are shown first.
            </p>
          )}
          <div className="divide-y divide-(--color-sand-strong) overflow-hidden rounded-xl border border-(--color-sand-strong) bg-white">
            {visiblePeople.map((person, index) => (
              <Fragment key={person.slug}>
                {index === claimedInVisible && claimedInVisible > 0 && (
                  <div className="bg-slate-50 px-4 py-1.5 text-[11px] font-semibold tracking-wide text-slate-400 uppercase">
                    All other teachers, organizers &amp; musicians
                  </div>
                )}
                <CompactTeacherRow
                  teacher={{
                    name: person.name,
                    slug: person.slug,
                    // Nomadic has no city by DB constraint, so the city slot would render empty.
                    // "Nomadic" is the word these people ticked themselves in their own dashboard
                    // ("I don't have one home base (nomadic)"), and it is already what their profile
                    // page shows, so the listing matches rather than inventing a second wording.
                    // Country is appended (unlike the per-country community rows, which don't need it
                    // because the page itself is already scoped to one country): this list spans 50
                    // countries, so "Berlin" alone leaves the reader guessing which one.
                    city: person.isNomadic
                      ? "Nomadic"
                      : person.city && person.countryLabel
                        ? `${person.city}, ${person.countryLabel}`
                        : (person.city ?? person.countryLabel),
                    bio: person.bioSnippet,
                    imageUrl: person.imageUrl,
                    linkUrl: person.linkUrl,
                    roles: person.roles,
                    isClaimed: person.isClaimed,
                  }}
                />
              </Fragment>
            ))}
          </div>
          {visibleCount < filtered.length && (
            <div className="mt-4 flex justify-center">
              <button
                onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                className="rounded-full border border-(--color-sand-strong) bg-white px-5 py-2 text-sm font-semibold text-slate-700 transition hover:border-(--color-pine) hover:text-(--color-pine)"
              >
                Load more ({filtered.length - visibleCount} remaining)
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="rounded-xl border border-(--color-sand-strong) bg-white p-10 text-center">
          <p className="text-slate-600">No one matches those filters.</p>
          <button onClick={resetFilters} className="mt-3 text-sm text-(--color-pine) underline">
            Clear filters
          </button>
        </div>
      )}
    </>
  );
}
