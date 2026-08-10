"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { searchProfiles, submitClaim, type ClaimableProfile } from "./actions";

export function ClaimSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ClaimableProfile[]>([]);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSearching, startSearch] = useTransition();
  const [claimingId, setClaimingId] = useState<string | null>(null);

  function runSearch(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startSearch(async () => {
      const found = await searchProfiles(query);
      setResults(found);
      setSearched(true);
    });
  }

  async function claim(profileId: string) {
    setError(null);
    setClaimingId(profileId);
    const result = await submitClaim(profileId);
    setClaimingId(null);
    if (result.success) {
      router.push("/dashboard");
      router.refresh();
    } else {
      setError(result.error ?? "Could not submit claim.");
    }
  }

  return (
    <div>
      <form onSubmit={runSearch} className="flex flex-col gap-3 sm:flex-row">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your name…"
          className="w-full rounded-2xl border border-(--color-sand-strong) bg-white px-4 py-3 text-base text-slate-950 outline-none transition focus:border-(--color-pine)"
        />
        <button
          type="submit"
          disabled={isSearching || query.trim().length < 2}
          className="rounded-full bg-(--color-ink) px-5 py-3 text-sm font-semibold text-(--color-mist) disabled:opacity-50"
        >
          {isSearching ? "Searching…" : "Search"}
        </button>
      </form>

      {error ? <p className="mt-4 text-sm text-rose-700">{error}</p> : null}

      {searched ? (
        <div className="mt-6">
          {results.length === 0 ? (
            <p className="text-base text-slate-600">
              No matching profiles found.
            </p>
          ) : (
            <ul className="divide-y divide-(--color-sand-strong)">
              {results.map((profile) => (
                <li key={profile.id} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="sm:pr-4">
                    <p className="font-semibold text-slate-950">{profile.name}</p>
                    {profile.roles ? <p className="text-xs uppercase tracking-wide text-(--color-pine)">{profile.roles}</p> : null}
                    {profile.bioSnippet ? <p className="mt-1 text-sm text-slate-600">{profile.bioSnippet}…</p> : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => claim(profile.id)}
                    disabled={claimingId !== null}
                    className="shrink-0 rounded-full border border-(--color-pine) px-4 py-2 text-sm font-semibold text-(--color-pine) hover:bg-(--color-pine) hover:text-(--color-mist) disabled:opacity-50"
                  >
                    {claimingId === profile.id ? "Submitting…" : "This is me"}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-6">
            <Link
              href="/dashboard/new-profile"
              className="inline-block rounded-full border border-(--color-sand-strong) px-5 py-3 text-sm font-semibold text-slate-700 hover:border-(--color-pine) hover:text-(--color-pine)"
            >
              None of these are me, add a new profile
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
