"use client";

import { useRef, useState, useTransition } from "react";

export type VenueResult = {
  id: string;
  name: string;
  city: string;
  country: string;
  lat: number | null;
  lng: number | null;
};

/**
 * Search-and-select a venue that's already in the system (accumulated one at a time via
 * /addevent's dedup-checked insert, or — admin only — created inline here), so organizers
 * don't have to retype an address for a recurring space. Falls back to free text when no
 * venue matches; the caller geocodes that free text server-side (see lib/geocode.ts).
 *
 * `allowCreate` is admin-only by design: creating a venue record is a curation call
 * (visibility tier, website requirement — see addvenue skill) that this quick inline path
 * deliberately skips by always landing new venues as `visibility: 'hidden'`. Organizers get
 * search+select only; an admin formalizes their free-text address into a real venue later
 * if it's worth reusing.
 */
// These pickers usually sit inside a form's <label> wrapper. Safari/WebKit (every iPhone browser)
// then forwards a click on one of their buttons to the label's first control, which after the
// re-render is the "Change" button, so a pick was undone the moment it was made (reproduced
// 2026-10-07: Denmark could not be selected). preventDefault cancels the label's forwarding; it does
// nothing else on a type="button".
//
// With no venue picked, the search box doubles as the place's name and a second box takes the
// street address (I-181). One shared box made people type "Studio X. Street 1, 1234 City", which
// the geocoder can't resolve, so events landed on the city centre.
export function VenuePicker({
  venueId,
  venueLabel,
  freeText,
  addressText,
  onSelect,
  onFreeTextChange,
  onAddressChange,
  city,
  country,
  allowCreate = false,
  inputClassName,
}: {
  venueId: string | null;
  venueLabel: string;
  freeText: string;
  addressText: string;
  onSelect: (venue: VenueResult | null) => void;
  onFreeTextChange: (value: string) => void;
  onAddressChange: (value: string) => void;
  city: string;
  country: string;
  allowCreate?: boolean;
  inputClassName: string;
}) {
  // Seeded from the stored name, so editing an event shows what it already has.
  const [query, setQuery] = useState(freeText);
  const [results, setResults] = useState<VenueResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isCreating, startCreateTransition] = useTransition();
  const abortRef = useRef<AbortController | null>(null);

  async function handleQueryChange(nextQuery: string) {
    setQuery(nextQuery);
    onFreeTextChange(nextQuery);

    if (abortRef.current) abortRef.current.abort();
    if (nextQuery.trim().length < 2) {
      setResults([]);
      setSearchError(null);
      setIsSearching(false);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setIsSearching(true);
    setSearchError(null);

    try {
      const response = await fetch(`/api/venues/search?q=${encodeURIComponent(nextQuery.trim())}`, {
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => ({ results: [] }));
      if (!response.ok) throw new Error(payload.error ?? "Search failed.");
      setResults(payload.results ?? []);
    } catch (error) {
      if (error instanceof Error && error.name !== "AbortError") {
        setSearchError(error.message);
      }
    } finally {
      if (abortRef.current === controller) setIsSearching(false);
    }
  }

  function selectVenue(venue: VenueResult) {
    onSelect(venue);
    setQuery("");
    setResults([]);
  }

  async function createVenue() {
    const name = query.trim();
    if (!name || !city.trim() || !country.trim()) return;

    const response = await fetch("/api/admin/venues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, city, country, address: addressText }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setSearchError(payload.error ?? "Could not create venue.");
      return;
    }
    selectVenue(payload.venue);
  }

  if (venueId) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-(--color-sand-strong) bg-(--color-mist) px-4 py-3">
        <span className="text-sm font-medium text-slate-900">
          📍 {venueLabel || "Selected venue"}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            onSelect(null);
          }}
          className="ml-auto text-sm font-semibold text-(--color-pine) hover:underline"
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* autoComplete="off": browsers' address autofill can target a free-text venue/address
          field and insert text outside React's onChange, causing the controlled value to snap
          back to stale state on the next render (see country-picker.tsx for the full writeup). */}
      <input
        value={query}
        onChange={(e) => void handleQueryChange(e.target.value)}
        className={inputClassName}
        placeholder="Search listed venues, or type the place's name"
        autoComplete="off"
        name="ci-th-venue-filter"
      />
      {isSearching ? <p className="text-xs text-slate-500">Searching…</p> : null}
      {searchError ? <p className="text-xs text-rose-700">{searchError}</p> : null}
      {results.length ? (
        <div className="flex flex-col gap-2">
          {results.map((venue) => (
            <button
              key={venue.id}
              type="button"
              onClick={(e) => {
                e.preventDefault();
                selectVenue(venue);
              }}
              className="rounded-2xl border border-(--color-sand-strong) bg-white px-4 py-2 text-left text-sm font-medium text-slate-900 hover:border-(--color-pine)"
            >
              {venue.name} <span className="text-slate-500">— {venue.city}, {venue.country}</span>
            </button>
          ))}
        </div>
      ) : null}
      {allowCreate && query.trim().length >= 2 && !results.some((r) => r.name.toLowerCase() === query.trim().toLowerCase()) ? (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            startCreateTransition(() => void createVenue());
          }}
          className="text-sm font-semibold text-(--color-pine) hover:underline"
        >
          {isCreating ? "Creating…" : `+ Create venue "${query.trim()}"`}
        </button>
      ) : null}
      {/* Below the matches, so the list opens right under the box being typed in. */}
      <input
        value={addressText}
        onChange={(e) => onAddressChange(e.target.value)}
        className={inputClassName}
        placeholder="Street address, e.g. Sedanstraße 22, 79098 Freiburg"
        aria-label="Street address"
        autoComplete="off"
        name="ci-th-venue-street"
      />
    </div>
  );
}
