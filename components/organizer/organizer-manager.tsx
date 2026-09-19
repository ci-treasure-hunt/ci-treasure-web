"use client";

import { useState, useTransition } from "react";
import { Plus, X, Loader2, Search } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { addOrganizer, removeOrganizer } from "@/app/events/[eventSlug]/edit/actions";
import { SuggestPerson } from "@/components/organizer/suggest-person";

type Organizer = {
  id: string;
  name: string;
  city: string | null;
  country: string | null;
};

/**
 * Edit-mode counterpart to the create form's Organizers picker, added 2026-09-19. Without it,
 * co-organizers could be added while submitting an event but never afterwards, which is the
 * kind of asymmetry people read as a bug rather than a limit.
 *
 * Deliberately simpler than TeacherManager: no role selector, since every organizer link is
 * written as 'lead' (co-organizer was abolished as a distinct role, and hosting_venue stays an
 * admin-side concept). Shares SuggestPerson with the teacher flows, so an organizer who isn't
 * listed yet is the same dedup-guarded path in all four places it can come up.
 */
export function OrganizerManager({
  eventId,
  initialOrganizers,
}: {
  eventId: string;
  initialOrganizers: Organizer[];
}) {
  const [organizers, setOrganizers] = useState<Organizer[]>(initialOrganizers);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Organizer[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selected, setSelected] = useState<Organizer | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  async function handleSearch(query: string) {
    setSearch(query);
    setError(null);
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }

    setIsSearching(true);
    // Same filter the admin picker and the create form use for an organizer search: people who
    // organize, plus teachers, since the same person often does both.
    const { data, error: searchError } = await supabase
      .from("profiles")
      .select("id, name, city, country")
      .ilike("name", `%${query.trim()}%`)
      .or("is_organizer.eq.true,is_teacher.eq.true")
      .limit(5);

    if (!searchError && data) {
      setResults(data.filter((r) => !organizers.some((o) => o.id === r.id)));
    }
    setIsSearching(false);
  }

  function handleAdd() {
    if (!selected) return;
    setError(null);
    startTransition(async () => {
      const result = await addOrganizer(eventId, selected.id);
      if (result.success) {
        setOrganizers([...organizers, selected]);
        setSelected(null);
        setSearch("");
        setResults([]);
      } else {
        setError(result.error ?? "Failed to add organizer");
      }
    });
  }

  function handleRemove(profileId: string) {
    setError(null);
    startTransition(async () => {
      const result = await removeOrganizer(eventId, profileId);
      if (result.success) {
        setOrganizers(organizers.filter((o) => o.id !== profileId));
      } else {
        setError(result.error ?? "Failed to remove organizer");
      }
    });
  }

  return (
    <section className="rounded-[1.75rem] border border-white/80 bg-white/70 p-5 shadow-[0_18px_55px_rgba(106,75,25,0.08)]">
      <h3 className="font-serif text-2xl text-slate-950">Organizers</h3>
      <p className="mt-1 text-sm text-slate-600">
        Everyone credited with running this event. You&apos;re listed here as the lead organizer.
      </p>

      {error && <p className="mt-4 text-sm font-medium text-rose-600">{error}</p>}

      <ul className="mt-6 space-y-3">
        {organizers.map((organizer) => (
          <li
            key={organizer.id}
            className="flex items-center justify-between rounded-2xl border border-(--color-sand-strong) bg-(--color-mist) p-3"
          >
            <div>
              <p className="text-sm font-semibold text-slate-900">{organizer.name}</p>
              <p className="text-xs text-slate-600">
                {[organizer.city, organizer.country].filter(Boolean).join(", ")}
              </p>
            </div>
            <button
              onClick={() => handleRemove(organizer.id)}
              disabled={isPending}
              className="rounded-full p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
              title="Remove organizer"
            >
              <X className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-8 border-t border-(--color-sand-strong) pt-6">
        <h4 className="text-sm font-semibold text-slate-900">Add an organizer</h4>
        <div className="relative mt-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name..."
              value={search}
              onChange={(e) => void handleSearch(e.target.value)}
              className="w-full rounded-full border border-(--color-sand-strong) bg-white py-2 pl-10 pr-4 text-sm text-slate-900 focus:border-(--color-pine) focus:outline-none"
            />
            {isSearching && (
              <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />
            )}
          </div>

          {/* `!selected` for the same reason as TeacherManager's: picking someone sets `search`
              to their name and clears `results`, which would otherwise satisfy this and offer to
              create the person already sitting selected below. */}
          {search.trim().length >= 2 && results.length === 0 && !isSearching && !selected && (
            <SuggestPerson
              query={search}
              kind="organizer"
              onPick={(profileId, name) => {
                setSelected({ id: profileId, name, city: null, country: null });
                setSearch(name);
                setResults([]);
              }}
            />
          )}

          {results.length > 0 && (
            <ul className="absolute z-10 mt-2 w-full rounded-2xl border border-(--color-sand-strong) bg-white py-2 shadow-lg">
              {results.map((profile) => (
                <li key={profile.id}>
                  <button
                    onClick={() => {
                      setSelected(profile);
                      setResults([]);
                      setSearch(profile.name);
                    }}
                    className="flex w-full flex-col px-4 py-2 text-left hover:bg-(--color-mist)"
                  >
                    <span className="text-sm font-medium text-slate-900">{profile.name}</span>
                    <span className="text-xs text-slate-500">
                      {[profile.city, profile.country].filter(Boolean).join(", ")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {selected && (
          <div className="mt-4 flex items-center gap-3 rounded-2xl border border-(--color-pine-light) bg-(--color-pine-mist) p-3">
            <div className="flex-1">
              <p className="text-sm font-semibold text-(--color-pine)">{selected.name}</p>
              <p className="text-xs text-slate-600">
                {[selected.city, selected.country].filter(Boolean).join(", ")}
              </p>
            </div>
            <button
              onClick={handleAdd}
              disabled={isPending}
              className="flex items-center gap-1 rounded-full bg-(--color-pine) px-4 py-1.5 text-xs font-bold text-white hover:bg-(--color-pine-strong) disabled:opacity-50"
            >
              {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              Add
            </button>
            <button
              onClick={() => setSelected(null)}
              className="rounded-full p-1 text-slate-400 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
