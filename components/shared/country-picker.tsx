"use client";

import { useState } from "react";

import { COUNTRIES } from "@/lib/countries";

/**
 * Search-and-select a country by name, mirroring VenuePicker's interaction (search-as-you-type,
 * selected chip with a "Change" button) so the two location fields feel consistent. Unlike
 * VenuePicker there's no free-text fallback and no create option — the list is fixed and small
 * enough to always contain a match, and that constraint is the point: it's what makes a typo
 * like "UK" (not a real ISO code — "GB" is) impossible to enter (found live 2026-07-22).
 */
export function CountryPicker({
  value,
  onChange,
  inputClassName,
}: {
  value: string;
  onChange: (code: string) => void;
  inputClassName: string;
}) {
  const [query, setQuery] = useState("");
  const selected = COUNTRIES.find((c) => c.code === value);
  const matches = query.trim().length
    ? COUNTRIES.filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8)
    : [];

  if (selected) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-(--color-sand-strong) bg-(--color-mist) px-4 py-3">
        <span className="text-sm font-medium text-slate-900">{selected.name}</span>
        <button
          type="button"
          onClick={() => onChange("")}
          className="ml-auto text-sm font-semibold text-(--color-pine) hover:underline"
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* autoComplete="off" + a name that avoids the literal word "country": browsers'
          built-in address autofill targets exactly this shape (a search field right after a
          City field) by heuristic, not just the autocomplete attribute — it can insert text
          directly into the DOM without firing React's onChange, so the controlled `value={query}`
          snaps back to stale state on the next render and the just-typed text visibly vanishes.
          Reported live 2026-08-04 (organizer typing "Poland" watched it disappear mid-type).
          The 2026-08-04 fix documented this rule but didn't apply it — `name` still contained
          "country" — so the field kept being autofill-hijacked in Safari specifically (WebKit
          is known to ignore autocomplete="off" on heuristically-detected address fields; Chrome/
          Firefox respect it). Reported live 2026-08-18: an organizer on Safari couldn't fill the
          country field at all, had to redo the whole submission in Firefox. Renamed to something
          with no semantic connection to "country" or "location" so the heuristic has nothing to
          match on. */}
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className={inputClassName}
        placeholder="Search countries…"
        autoComplete="off"
        name="ci-th-field-b2"
      />
      {matches.length ? (
        <div className="flex flex-col gap-2">
          {matches.map((c) => (
            <button
              key={c.code}
              type="button"
              onClick={() => {
                onChange(c.code);
                setQuery("");
              }}
              className="rounded-2xl border border-(--color-sand-strong) bg-white px-4 py-2 text-left text-sm font-medium text-slate-900 hover:border-(--color-pine)"
            >
              {c.name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
