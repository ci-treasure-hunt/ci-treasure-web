"use client";

import { useState, useTransition } from "react";
import { Plus, X, Loader2, Search } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { addTeacher, removeTeacher, updateTeacherRole } from "@/app/events/[eventSlug]/edit/actions";
import { SuggestPerson } from "@/components/organizer/suggest-person";
import { TEACHER_ROLE_OPTIONS } from "@/lib/organizer-events";

type Teacher = {
  id: string;
  name: string;
  role: string;
  city: string | null;
  country: string | null;
};

type ProfileResult = {
  id: string;
  name: string;
  city: string | null;
  country: string | null;
};

// Was a local list that had drifted from TEACHER_ROLE_OPTIONS (it carried "facilitator", which
// the shared list was missing despite 27 live rows using it — the shared list has since gained
// it). One source of truth now, so the create form, the admin form and this all offer the same
// roles.
const ROLES = TEACHER_ROLE_OPTIONS;

export function TeacherManager({
  eventId,
  initialTeachers,
}: {
  eventId: string;
  initialTeachers: Teacher[];
}) {
  const [teachers, setTeachers] = useState<Teacher[]>(initialTeachers);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<ProfileResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<ProfileResult | null>(null);
  const [selectedRole, setSelectedRole] = useState("teacher");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  async function handleSearch(query: string) {
    setSearch(query);
    if (query.length < 2) {
      setResults([]);
      return;
    }

    setIsSearching(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("id, name, city, country")
      .ilike("name", `%${query}%`)
      .limit(5);

    if (!error && data) {
      setResults(data);
    }
    setIsSearching(false);
  }

  function handleAdd() {
    if (!selectedProfile) return;
    setError(null);

    startTransition(async () => {
      const result = await addTeacher(eventId, selectedProfile.id, selectedRole);
      if (result.success) {
        setTeachers([...teachers, { ...selectedProfile, role: selectedRole }]);
        setSelectedProfile(null);
        setSearch("");
        setResults([]);
      } else {
        setError(result.error ?? "Failed to add teacher");
      }
    });
  }

  function handleRemove(teacherId: string) {
    setError(null);
    startTransition(async () => {
      const result = await removeTeacher(eventId, teacherId);
      if (result.success) {
        setTeachers(teachers.filter((t) => t.id !== teacherId));
      } else {
        setError(result.error ?? "Failed to remove teacher");
      }
    });
  }

  function handleUpdateRole(teacherId: string, role: string) {
    setError(null);
    startTransition(async () => {
      const result = await updateTeacherRole(eventId, teacherId, role);
      if (result.success) {
        setTeachers(teachers.map((t) => (t.id === teacherId ? { ...t, role } : t)));
      } else {
        setError(result.error ?? "Failed to update role");
      }
    });
  }

  return (
    <section className="mt-6 rounded-[1.75rem] border border-white/80 bg-white/70 p-5 shadow-[0_18px_55px_rgba(106,75,25,0.08)]">
      <h3 className="font-serif text-2xl text-slate-950">Teachers</h3>
      <p className="mt-1 text-sm text-slate-600">
        Add or remove teachers and musicians linked to this event.
      </p>

      {error && <p className="mt-4 text-sm font-medium text-rose-600">{error}</p>}

      <ul className="mt-6 space-y-3">
        {teachers.map((teacher) => (
          <li
            key={teacher.id}
            className="flex items-center justify-between rounded-2xl border border-(--color-sand-strong) bg-(--color-mist) p-3"
          >
            <div>
              <p className="text-sm font-semibold text-slate-900">{teacher.name}</p>
              <p className="text-xs text-slate-600">
                {[teacher.city, teacher.country].filter(Boolean).join(", ")}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <select
                value={teacher.role}
                onChange={(e) => handleUpdateRole(teacher.id, e.target.value)}
                disabled={isPending}
                className="rounded-full border border-(--color-sand-strong) bg-white px-3 py-1 text-xs font-medium text-slate-700 focus:border-(--color-pine) focus:outline-none disabled:opacity-50"
              >
                {ROLES.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
              <button
                onClick={() => handleRemove(teacher.id)}
                disabled={isPending}
                className="rounded-full p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                title="Remove teacher"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-8 border-t border-(--color-sand-strong) pt-6">
        <h4 className="text-sm font-semibold text-slate-900">Add a teacher</h4>
        <div className="relative mt-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name..."
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-full rounded-full border border-(--color-sand-strong) bg-white py-2 pl-10 pr-4 text-sm text-slate-900 focus:border-(--color-pine) focus:outline-none"
            />
            {isSearching && (
              <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />
            )}
          </div>

          {/* `!selectedProfile` matters: picking someone from the dropdown sets `search` to
              their name and clears `results`, which used to satisfy this condition and show
              "not listed, contact us" directly above the person you had just selected. */}
          {search.length >= 2 && results.length === 0 && !isSearching && !selectedProfile && (
            <SuggestPerson
              query={search}
              kind="teacher"
              onPick={(profileId, name) => {
                setSelectedProfile({ id: profileId, name, city: null, country: null });
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
                      setSelectedProfile(profile);
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

        {selectedProfile && (
          <div className="mt-4 flex items-center gap-3 rounded-2xl border border-(--color-pine-light) bg-(--color-pine-mist) p-3">
            <div className="flex-1">
              <p className="text-sm font-semibold text-(--color-pine)">{selectedProfile.name}</p>
              <p className="text-xs text-slate-600">
                {[selectedProfile.city, selectedProfile.country].filter(Boolean).join(", ")}
              </p>
            </div>
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="rounded-full border border-(--color-sand-strong) bg-white px-3 py-1 text-xs font-medium text-slate-700 focus:border-(--color-pine) focus:outline-none"
            >
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
            <button
              onClick={handleAdd}
              disabled={isPending}
              className="flex items-center gap-1 rounded-full bg-(--color-pine) px-4 py-1.5 text-xs font-bold text-white hover:bg-(--color-pine-strong) disabled:opacity-50"
            >
              {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              Add
            </button>
            <button
              onClick={() => setSelectedProfile(null)}
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
