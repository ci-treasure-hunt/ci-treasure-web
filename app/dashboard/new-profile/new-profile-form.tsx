"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { checkSimilarProfiles, createProfile, type SimilarProfile } from "./actions";

export function NewProfileForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [isOrganizer, setIsOrganizer] = useState(true);
  const [isTeacher, setIsTeacher] = useState(false);
  const [isMusician, setIsMusician] = useState(false);

  const [similar, setSimilar] = useState<SimilarProfile[] | null>(null);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submitProfile() {
    setError(null);
    startTransition(async () => {
      const result = await createProfile({ name, website, isOrganizer, isTeacher, isMusician });
      if (result.success) {
        router.push("/dashboard");
      } else {
        setError(result.error ?? "Could not create profile.");
      }
    });
  }

  function handleContinue(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const matches = await checkSimilarProfiles(name);
      setChecked(true);
      if (matches.length > 0) {
        setSimilar(matches);
      } else {
        submitProfile();
      }
    });
  }

  // Warning step — one or more similar existing profiles found. Advisory only: either claim
  // one of these instead, or confirm and create a new profile anyway.
  if (checked && similar && similar.length > 0) {
    return (
      <div>
        <p className="text-base leading-7 text-slate-700">
          {similar.length > 1 ? "A couple of profiles have" : "A profile has"} a similar name. Just double-checking,
          is one of these you?
        </p>
        <ul className="mt-4 space-y-3">
          {similar.map((profile) => (
            <li
              key={profile.id}
              className="flex flex-col gap-2 rounded-2xl border border-(--color-sand-strong) bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-semibold text-slate-950">{profile.name}</p>
                {profile.bioSnippet ? <p className="text-sm text-slate-600">{profile.bioSnippet}…</p> : null}
              </div>
              <Link
                href={`/dashboard/claim?profile=${profile.id}`}
                className="shrink-0 rounded-full border border-(--color-pine) px-4 py-2 text-center text-sm font-semibold text-(--color-pine) hover:bg-(--color-pine) hover:text-(--color-mist)"
              >
                This is me
              </Link>
            </li>
          ))}
        </ul>

        {error ? <p className="mt-4 text-sm text-rose-700">{error}</p> : null}

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={submitProfile}
            disabled={pending}
            className="rounded-full border border-(--color-sand-strong) px-5 py-3 text-sm font-semibold text-slate-700 hover:border-(--color-pine) hover:text-(--color-pine) disabled:opacity-50"
          >
            {pending ? "…" : "None of these are me, create a new profile"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleContinue} className="space-y-5">
      <div className="space-y-2">
        <label htmlFor="name" className="text-sm font-medium text-slate-700">
          Name <span className="text-rose-600">*</span>
        </label>
        <input
          id="name"
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-2xl border border-(--color-sand-strong) bg-white px-4 py-3 text-base text-slate-950 outline-none transition focus:border-(--color-pine)"
          placeholder="Your name"
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="website" className="text-sm font-medium text-slate-700">
          Website
        </label>
        <input
          id="website"
          type="url"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          className="w-full rounded-2xl border border-(--color-sand-strong) bg-white px-4 py-3 text-base text-slate-950 outline-none transition focus:border-(--color-pine)"
          placeholder="https://…"
        />
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-slate-700">I am a…</legend>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={isOrganizer}
            onChange={(e) => setIsOrganizer(e.target.checked)}
            className="h-4 w-4"
          />
          Organizer
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={isTeacher}
            onChange={(e) => setIsTeacher(e.target.checked)}
            className="h-4 w-4"
          />
          Teacher
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={isMusician}
            onChange={(e) => setIsMusician(e.target.checked)}
            className="h-4 w-4"
          />
          Musician
        </label>
      </fieldset>

      {error ? <p className="text-sm text-rose-700">{error}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-(--color-ink) px-5 py-3 text-sm font-semibold text-(--color-mist) disabled:opacity-50"
      >
        {pending ? "Checking…" : "Create profile"}
      </button>
      <p className="text-sm text-slate-500">
        This is just the basics — you can add a bio, photo, city, and social links once your
        profile is created.
      </p>
    </form>
  );
}
