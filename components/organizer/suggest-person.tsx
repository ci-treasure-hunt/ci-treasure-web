"use client";

import { useState, useTransition } from "react";

import { checkSimilarProfileNames, suggestPersonProfile, type SimilarProfileMatch } from "@/app/events/actions";

/**
 * The "this person isn't listed yet" branch of a people search, shared by the create-mode
 * PersonPicker and the edit-mode TeacherManager. Extracted 2026-09-19 rather than duplicated:
 * create mode got this flow first and edit mode was left with the old "contact us" dead end, so
 * whether an organizer could add an unlisted teacher depended on whether they were submitting a
 * new event or editing an existing one.
 *
 * Checks for a similar existing name before creating anything (typo, nickname, maiden name),
 * since the caller only renders this once its own search came back empty, which is exactly when
 * a near-duplicate is easiest to create. `onPick` receives either an existing profile the user
 * recognised (`created: false`, so callers don't tell them it's awaiting review when it's
 * already live) or the freshly created stub, and may be async (edit mode writes immediately).
 */
export function SuggestPerson({
  query,
  kind,
  onPick,
}: {
  query: string;
  kind: "teacher" | "organizer";
  onPick: (profileId: string, name: string, created: boolean) => void | Promise<void>;
}) {
  const [similar, setSimilar] = useState<SimilarProfileMatch[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startPending] = useTransition();
  const [lastQuery, setLastQuery] = useState(query);

  const name = query.trim();

  // A new search is a new question, so drop any similar-name panel or error from the previous
  // one. Adjusted during render rather than in an effect (React's documented pattern for
  // resetting state when a prop changes): an effect would render the stale panel first and then
  // immediately re-render without it.
  if (query !== lastQuery) {
    setLastQuery(query);
    setSimilar(null);
    setError(null);
  }

  function createStub() {
    if (!name) return;
    startPending(async () => {
      const result = await suggestPersonProfile(name, kind);
      if (!result.success || !result.profileId) {
        setError(result.error ?? "Could not suggest this profile.");
        return;
      }
      await onPick(result.profileId, name, true);
    });
  }

  function checkThenSuggest() {
    if (!name) return;
    setError(null);
    startPending(async () => {
      const matches = await checkSimilarProfileNames(name);
      if (matches.length > 0) {
        setSimilar(matches);
        return;
      }
      const result = await suggestPersonProfile(name, kind);
      if (!result.success || !result.profileId) {
        setError(result.error ?? "Could not suggest this profile.");
        return;
      }
      await onPick(result.profileId, name, true);
    });
  }

  if (similar && similar.length > 0) {
    return (
      <div className="mt-2">
        <p className="text-sm text-slate-600">
          {similar.length > 1 ? "A couple of profiles have" : "A profile has"} a similar name. One of these?
        </p>
        <div className="mt-2 flex flex-col gap-2">
          {similar.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => void onPick(m.id, m.name, false)}
              className="rounded-2xl border border-(--color-sand-strong) bg-white px-4 py-3 text-left text-sm font-medium text-slate-900 hover:border-(--color-pine)"
            >
              {m.name}
              {m.bioSnippet ? <span className="block text-xs text-slate-500">{m.bioSnippet}…</span> : null}
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={isPending}
          onClick={createStub}
          className="mt-2 text-sm font-medium text-slate-600 underline disabled:opacity-50"
        >
          None of these, suggest &quot;{name}&quot; as new
        </button>
        {error ? <p className="mt-1 text-sm text-rose-700">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="mt-2">
      <p className="text-sm text-slate-600">No match for &quot;{name}&quot;. Not listed yet?</p>
      <button
        type="button"
        disabled={isPending}
        onClick={checkThenSuggest}
        className="mt-2 rounded-2xl border border-(--color-sand-strong) bg-white px-4 py-3 text-left text-sm font-medium text-slate-900 hover:border-(--color-pine) disabled:opacity-50"
      >
        {isPending ? "Checking…" : `Suggest "${name}" as a new ${kind}`}
      </button>
      <p className="mt-1 text-xs text-slate-500">
        We&apos;ll add their bio and photo ourselves before this goes live; no need to contact us
        separately.
      </p>
      {error ? <p className="mt-1 text-sm text-rose-700">{error}</p> : null}
    </div>
  );
}
