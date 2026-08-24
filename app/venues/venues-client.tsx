"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, ExternalLink, Facebook, Globe, Instagram, MapPin, Search, X, Filter, Youtube } from "lucide-react";

import type { VenueListItem } from "@/lib/venues";
import { GENERIC_ACCENT_GRADIENT } from "@/lib/event-display";
import { Button } from "@/components/ui/button";
import { CONTINENT_COUNTRIES, CONTINENT_LABELS } from "@/lib/continents";
import { PLATFORM_ICON_CLASS, TelegramIcon, WhatsAppIcon, SignalIcon } from "@/components/platform-icons";
import { getMediumUrl, toCdnUrl } from "@/lib/image-url";

type VenuesClientProps = {
  initialVenues: VenueListItem[];
  initialCountries: Array<{ value: string; label: string }>;
  initialError: string | null;
};

function channelIcon(type: string) {
  if (type.startsWith("telegram")) return <TelegramIcon className="size-4" />;
  if (type.startsWith("whatsapp")) return <WhatsAppIcon />;
  if (type.startsWith("signal")) return <SignalIcon />;
  if (type.startsWith("facebook")) return <Facebook className="size-4" />;
  if (type === "instagram") return <Instagram className="size-4" />;
  if (type === "youtube") return <Youtube className="size-4" />;
  if (type === "calendar") return <CalendarDays className="size-4" />;
  return <ExternalLink className="size-4" />;
}

export function VenuesClient({
  initialVenues,
  initialCountries,
  initialError,
}: VenuesClientProps) {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [searchQuery, setSearchQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const selectedCountry = searchParams.get("country") ?? "";

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    const qs = params.toString();
    router.replace(qs ? `/venues?${qs}` : "/venues", { scroll: false });
  }

  const setSelectedCountry = (v: string) => setParam("country", v);

  const activeFilterCount = [selectedCountry].filter(Boolean).length;

  const resetFilters = () => {
    router.replace("/venues", { scroll: false });
    setSearchQuery("");
  };

  const groupedCountryOptions = useMemo(() => {
    const groups = (["americas", "emea", "apac"] as const).map((key) => ({
      key,
      label: CONTINENT_LABELS[key],
      value: `__continent_${key}`,
      countries: initialCountries.filter((o) => CONTINENT_COUNTRIES[key].includes(o.value)),
    }));
    return groups.filter((g) => g.countries.length > 0);
  }, [initialCountries]);

  const filteredVenues = useMemo(() => {
    return initialVenues.filter((venue) => {
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const nameMatch = venue.name?.toLowerCase().includes(query);
        const cityMatch = venue.city?.toLowerCase().includes(query);
        const countryMatch = venue.country?.toLowerCase().includes(query);
        if (!nameMatch && !cityMatch && !countryMatch) return false;
      }

      if (selectedCountry) {
        if (selectedCountry.startsWith("__continent_")) {
          const key = selectedCountry.slice("__continent_".length);
          if (!CONTINENT_COUNTRIES[key]?.includes(venue.countryIso)) return false;
        } else if (venue.countryIso !== selectedCountry) {
          return false;
        }
      }

      return true;
    });
  }, [initialVenues, searchQuery, selectedCountry]);

  if (initialError) {
    return (
      <div className="mx-auto max-w-4xl text-center">
        <div className="mb-6 rounded-2xl border-2 border-amber-200 bg-amber-50 p-6">
          <p className="mb-2 font-serif text-2xl text-amber-900">Unable to load venues</p>
          <p className="text-amber-800">{initialError}</p>
        </div>
        <p className="text-sm text-slate-500">
          Please try again later or contact us if the problem persists.
        </p>
      </div>
    );
  }

  return (
    <>
        {/* Search & Filter Toolbar */}
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
                  <span className="rounded-full bg-violet-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                    {activeFilterCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          <div className={`flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 md:pt-4 ${filtersOpen ? "flex" : "hidden"} lg:flex`}>
            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
              <select
                aria-label="Filter by country"
                value={selectedCountry}
                onChange={(e) => setSelectedCountry(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100 sm:w-44"
              >
                <option value="">All Countries</option>
                {groupedCountryOptions.map((group) => (
                  <optgroup key={group.key} label={group.label}>
                    <option value={group.value}>All {group.label}</option>
                    {group.countries.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-4 text-xs font-semibold text-slate-500 w-full justify-between sm:w-auto sm:justify-end border-t border-slate-50 pt-2 sm:border-none sm:pt-0">
              <span>
                {filteredVenues.length} of {initialVenues.length} venues
              </span>
              {(searchQuery || selectedCountry) && (
                <button onClick={resetFilters} className="text-violet-600 hover:text-violet-800 transition">
                  Clear all filters
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Card grid */}
        {filteredVenues.length > 0 ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filteredVenues.map((venue) => (
              <VenueCard key={venue.id} venue={venue} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white/75 px-6 py-16 text-center">
            <p className="font-serif text-xl font-medium text-slate-900">No venues found.</p>
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

        <section className="mt-12 rounded-2xl bg-(--color-pine) p-8 text-center text-white">
          <h2 className="mb-2 font-serif text-2xl">Is your venue missing?</h2>
          <p className="mx-auto mb-6 max-w-2xl text-sm leading-6 text-white/75">
            Let us know and we&apos;ll take a look — this is a curated list, added and maintained
            by hand.
          </p>
          <a
            href="mailto:hello@citreasurehunt.com"
            className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-medium text-(--color-pine) transition hover:bg-slate-100"
          >
            <ExternalLink className="size-4" />
            hello@citreasurehunt.com
          </a>
        </section>
    </>
  );
}

function VenueCard({ venue }: { venue: VenueListItem }) {
  const imageUrl = venue.imageUrl?.trim() ?? "";
  const renderImage = imageUrl.length > 0;

  return (
    <div className="group relative flex min-w-0 flex-col overflow-hidden rounded-2xl border border-(--color-sand-strong) bg-white shadow-sm transition hover:shadow-lg">
      <Link href={`/venues/${venue.slug}`} className="absolute inset-0 z-10" aria-label={venue.name} />

      {renderImage ? (
        <div className="relative h-44 border-b border-(--color-sand-strong)">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={toCdnUrl(getMediumUrl(imageUrl))} alt={venue.name} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" />
        </div>
      ) : (
        <div className={`h-44 border-b border-(--color-sand-strong) ${GENERIC_ACCENT_GRADIENT}`} />
      )}

      <div className="flex min-w-0 flex-1 flex-col p-4">
        <h2 className="mb-1 font-serif text-lg text-slate-900 wrap-break-word">{venue.name}</h2>
        <p className="mb-3 flex min-w-0 items-center gap-1 text-sm text-slate-500">
          <MapPin className="size-3 shrink-0 text-slate-400" />
          <span className="min-w-0 wrap-break-word">
            {venue.city}
            {venue.city && venue.country && ", "}
            {venue.country}
          </span>
        </p>

        {venue.description && (
          <p className="mb-3 line-clamp-2 wrap-break-word text-sm text-slate-600">{venue.description}</p>
        )}

        <div className="mt-auto flex flex-wrap gap-2 pt-1">
          {venue.website && (
            <a href={venue.website} target="_blank" rel="noopener noreferrer" className={PLATFORM_ICON_CLASS} aria-label="Website">
              <Globe className="size-4" />
            </a>
          )}
          {venue.channelLinks.map((link, i) => (
            <a
              key={i}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className={PLATFORM_ICON_CLASS}
              aria-label={link.label}
            >
              {channelIcon(link.type)}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
