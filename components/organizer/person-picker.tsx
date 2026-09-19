"use client";

import { useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { type OrganizerTeacherItem } from "@/lib/organizer-events";
import { SuggestPerson } from "@/components/organizer/suggest-person";

type ProfileResult = {
  id: string;
  name: string;
  city: string | null;
  country: string | null;
};

const inputClassName =
  "w-full rounded-2xl border border-(--color-sand-strong) bg-white px-4 py-3 text-sm text-slate-950 outline-none ring-0 transition focus:border-(--color-pine)";

/**
 * Create-mode people picker, generalized 2026-09-19 to cover both teachers and organizers
 * (was InlineTeacherPicker, teachers-only). Keeps selections in local state and hands them to
 * the parent form instead of writing to event_teachers/event_organizers directly, since those
 * tables need a real event id that doesn't exist yet at this point (unlike TeacherManager /
 * the admin PeoplePicker, which edit an existing event). createEvent inserts these links right
 * after the event row itself.
 *
 * A no-results search first checks for a similar existing name (checkSimilarProfileNames, same
 * dedup guard the self-submitted profile flow uses) before offering to create a stub — added
 * after shipping without it let a typo'd search create a near-duplicate profile. Confirmed
 * "none of these" then creates a name-only admin-review stub (suggestPersonProfile) rather than
 * a full profile the organizer fills in themselves: there's no consenting person on the other
 * end to hand editing to.
 */
export function PersonPicker({
  title,
  description,
  kind,
  items,
  onChange,
  roleOptions,
}: {
  title: string;
  description: string;
  kind: "teacher" | "organizer";
  items: OrganizerTeacherItem[];
  onChange: (items: OrganizerTeacherItem[]) => void;
  // Omit to hide the per-row role selector and link everyone at a fixed role (organizers: no
  // selector, always "lead" — co-organizer isn't a role this form offers, see
  // OrganizerEventFormData's comment on `organizers`).
  roleOptions?: readonly string[];
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProfileResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [suggested, setSuggested] = useState<string | null>(null);
  const supabase = createClient();

  const defaultRole = roleOptions?.[0] ?? "lead";

  function reset() {
    setQuery("");
    setResults([]);
  }

  async function handleSearch(nextQuery: string) {
    setQuery(nextQuery);
    if (nextQuery.trim().length < 2) {
      setResults([]);
      return;
    }
    setIsSearching(true);
    const trimmed = nextQuery.trim();
    let builder = supabase
      .from("profiles")
      .select("id, name, city, country")
      .ilike("name", `%${trimmed}%`)
      .limit(5);
    // Same role filter the admin PeoplePicker's search API uses: an organizer search also
    // surfaces teachers (often the same person wears both hats), a teacher search also
    // surfaces musicians.
    builder =
      kind === "organizer"
        ? builder.or("is_organizer.eq.true,is_teacher.eq.true")
        : builder.or("is_teacher.eq.true,is_musician.eq.true");
    const { data, error } = await builder;
    if (!error && data) {
      setResults(data.filter((r) => !items.some((item) => item.profileId === r.id)));
    }
    setIsSearching(false);
  }

  function addPerson(profileId: string, name: string, wasSuggested = false) {
    onChange([...items, { profileId, name, role: defaultRole }]);
    if (wasSuggested) setSuggested(name);
    reset();
  }

  function updateRole(index: number, role: string) {
    onChange(items.map((item, i) => (i === index ? { ...item, role } : item)));
  }

  function removeItem(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  return (
    <section className="rounded-[1.75rem] border border-white/80 bg-white/90 p-6 shadow-[0_18px_55px_rgba(106,75,25,0.08)]">
      <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">{title}</h3>
      <p className="mt-1 text-sm text-slate-600">{description}</p>

      <div className="mt-4 space-y-3">
        {items.map((item, index) => (
          <div key={`${item.profileId}-${index}`} className="rounded-2xl border border-(--color-sand-strong) bg-(--color-mist) p-4">
            <div className={`grid gap-3 md:items-center ${roleOptions ? "md:grid-cols-[2fr_1fr_auto]" : "md:grid-cols-[1fr_auto]"}`}>
              <p className="font-medium text-slate-950">{item.name}</p>
              {roleOptions ? (
                <select value={item.role} onChange={(e) => updateRole(index, e.target.value)} className={inputClassName}>
                  {roleOptions.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              ) : null}
              <button type="button" onClick={() => removeItem(index)} className="text-sm font-semibold text-rose-700">
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-2xl border border-(--color-sand-strong) bg-(--color-mist) p-4">
        <input
          value={query}
          onChange={(e) => void handleSearch(e.target.value)}
          className={inputClassName}
          placeholder="Search by name…"
        />
        {isSearching ? <p className="mt-2 text-sm text-slate-500">Searching…</p> : null}
        {results.length ? (
          <div className="mt-2 flex flex-col gap-2">
            {results.map((result) => (
              <button
                key={result.id}
                type="button"
                onClick={() => addPerson(result.id, result.name)}
                className="rounded-2xl border border-(--color-sand-strong) bg-white px-4 py-3 text-left text-sm font-medium text-slate-900"
              >
                {result.name}
                {result.city ? <span className="text-slate-500"> — {[result.city, result.country].filter(Boolean).join(", ")}</span> : null}
              </button>
            ))}
          </div>
        ) : null}

        {query.trim().length >= 2 && !results.length && !isSearching ? (
          <SuggestPerson
            query={query}
            kind={kind}
            onPick={(profileId, name, created) => addPerson(profileId, name, created)}
          />
        ) : null}
        {suggested ? (
          <p className="mt-2 text-sm text-emerald-700">
            Suggested &quot;{suggested}&quot;, added below and pending our review.
          </p>
        ) : null}
      </div>
    </section>
  );
}
