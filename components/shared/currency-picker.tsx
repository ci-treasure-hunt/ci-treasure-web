"use client";

import { useState } from "react";

import { CURRENCIES } from "@/lib/currencies";

/**
 * Search-and-select a currency, mirroring CountryPicker/VenuePicker's interaction. Matches on
 * both name and code ("eur" and "euro" both find EUR) since organizers reach for either.
 */
// These pickers usually sit inside a form's <label> wrapper. Safari/WebKit (every iPhone browser)
// then forwards a click on one of their buttons to the label's first control, which after the
// re-render is the "Change" button, so a pick was undone the moment it was made (reproduced
// 2026-10-07: Denmark could not be selected). preventDefault cancels the label's forwarding; it does
// nothing else on a type="button".
export function CurrencyPicker({
  value,
  onChange,
  inputClassName,
}: {
  value: string;
  onChange: (code: string) => void;
  inputClassName: string;
}) {
  const [query, setQuery] = useState("");
  const selected = CURRENCIES.find((c) => c.code === value);
  const matches = query.trim().length
    ? CURRENCIES.filter((c) => `${c.name} ${c.code}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8)
    : [];

  if (selected) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-(--color-sand-strong) bg-(--color-mist) px-4 py-3">
        <span className="text-sm font-medium text-slate-900">
          {selected.name} ({selected.code})
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            onChange("");
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
      {/* autoComplete="off": same browser-autofill desync risk as CountryPicker/VenuePicker
          (see country-picker.tsx for the full writeup), applied here for consistency. */}
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className={inputClassName}
        placeholder="Search currencies…"
        autoComplete="off"
        name="ci-th-currency-filter"
      />
      {matches.length ? (
        <div className="flex flex-col gap-2">
          {matches.map((c) => (
            <button
              key={c.code}
              type="button"
              onClick={(e) => {
                e.preventDefault();
                onChange(c.code);
                setQuery("");
              }}
              className="rounded-2xl border border-(--color-sand-strong) bg-white px-4 py-2 text-left text-sm font-medium text-slate-900 hover:border-(--color-pine)"
            >
              {c.name} <span className="text-slate-500">({c.code})</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
