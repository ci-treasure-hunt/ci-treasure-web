"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { PersonPicker } from "@/components/organizer/person-picker";
import { TEACHER_ROLE_OPTIONS } from "@/lib/admin-events";
import { type OrganizerTeacherItem } from "@/lib/organizer-events";

import { addOrganizerSeriesDates, type OrganizerAddDatesResult } from "./actions";

const inputClass =
  "w-full rounded-2xl border border-(--color-sand-strong) bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-(--color-pine)";

type Mode = "same" | "pick";

export function SeriesAddDatesForm({
  seriesId,
  seriesTitle,
  latest,
  trusted,
}: {
  seriesId: string;
  seriesTitle: string;
  latest: { date: string; title: string; teachers: string[] } | null;
  trusted: boolean;
}) {
  const [dates, setDates] = useState<string[]>([""]);
  const [mode, setMode] = useState<Mode>("same");
  const [teachers, setTeachers] = useState<OrganizerTeacherItem[]>([]);
  const [title, setTitle] = useState(latest?.title ?? seriesTitle);
  const [titleTouched, setTitleTouched] = useState(false);
  const [result, setResult] = useState<OrganizerAddDatesResult | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const today = new Date().toISOString().slice(0, 10);

  function switchMode(next: Mode) {
    setMode(next);
    // The latest date's title usually names its teacher ("... with Adriana"), which is wrong for a
    // new guest, so new teachers start from the series title instead. Kept once edited by hand.
    if (!titleTouched) setTitle(next === "same" ? latest?.title ?? seriesTitle : seriesTitle);
  }

  function submit() {
    setResult(null);
    startTransition(async () => {
      const res = await addOrganizerSeriesDates({
        seriesId,
        dates,
        teacherMode: mode,
        teachers: teachers.map((t) => ({ profileId: t.profileId, role: t.role })),
        title,
      });
      setResult(res);
      if (res.success && res.created?.length) {
        setDates([""]);
        setTeachers([]);
        router.refresh();
      }
    });
  }

  return (
    <section className="rounded-[1.75rem] border border-white/80 bg-white/90 p-6 shadow-[0_18px_55px_rgba(106,75,25,0.08)]">
      <h2 className="font-serif text-2xl text-slate-950">Add dates</h2>
      <p className="mt-2 text-sm text-slate-600">
        New dates copy everything from {latest ? `the latest date (${latest.date})` : "the series"}: time, place,
        price, links, picture and description. {trusted
          ? "They go live straight away."
          : "We review them before they go live, usually within a day or two."}
      </p>

      <div className="mt-5 space-y-2">
        <p className="text-sm font-semibold text-slate-800">Dates</p>
        {dates.map((d, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="date"
              min={today}
              value={d}
              onChange={(e) => setDates(dates.map((x, j) => (j === i ? e.target.value : x)))}
              className={inputClass}
            />
            {dates.length > 1 ? (
              <button
                type="button"
                onClick={() => setDates(dates.filter((_, j) => j !== i))}
                className="text-sm font-semibold text-rose-700"
              >
                Remove
              </button>
            ) : null}
          </div>
        ))}
        <button
          type="button"
          onClick={() => setDates([...dates, ""])}
          className="text-sm font-semibold text-(--color-pine) hover:underline"
        >
          + Another date
        </button>
      </div>

      <fieldset className="mt-6 space-y-2">
        <legend className="text-sm font-semibold text-slate-800">Teachers</legend>
        <label className="flex items-start gap-2 text-sm text-slate-800">
          <input type="radio" name="teacherMode" checked={mode === "same"} onChange={() => switchMode("same")} className="mt-1" />
          <span>
            Same as the latest date
            {latest?.teachers.length ? ` (${latest.teachers.join(", ")})` : ""}
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm text-slate-800">
          <input type="radio" name="teacherMode" checked={mode === "pick"} onChange={() => switchMode("pick")} className="mt-1" />
          <span>Different teachers, for example a guest. For a different guest each time, add one date at a time.</span>
        </label>
      </fieldset>

      {mode === "pick" ? (
        <div className="mt-4">
          <PersonPicker
            title="Teachers for these dates"
            description="Search for each teacher. If someone is not listed yet, you can suggest them."
            kind="teacher"
            items={teachers}
            onChange={setTeachers}
            roleOptions={TEACHER_ROLE_OPTIONS}
          />
        </div>
      ) : null}

      <label className="mt-6 flex flex-col gap-1 text-sm font-semibold text-slate-800">
        Title for these dates
        <input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setTitleTouched(true);
          }}
          className={inputClass}
        />
        <span className="text-xs font-normal text-slate-500">
          Name the guest if there is one, for example &quot;{seriesTitle} with Maria Rossi&quot;.
        </span>
      </label>

      <button
        type="button"
        onClick={submit}
        disabled={pending || !dates.some(Boolean) || !title.trim()}
        className="mt-6 rounded-full bg-(--color-ink) px-5 py-3 text-sm font-semibold text-(--color-mist) disabled:opacity-50"
      >
        {pending ? "Adding…" : "Add dates"}
      </button>

      {result && !result.success ? <p className="mt-4 text-sm text-rose-700">{result.error}</p> : null}
      {result?.success ? (
        <div className="mt-4 space-y-2 text-sm">
          <p className="font-semibold text-slate-900">
            {result.created?.length
              ? `${result.created.length} ${result.created.length === 1 ? "date" : "dates"} added${result.published ? " and live" : ", waiting for review"}.`
              : "No new dates were added."}
          </p>
          {result.created?.length ? (
            <ul className="list-disc pl-5 text-slate-700">
              {result.created.map((c) => (
                <li key={c.slug}>
                  {c.startDate}:{" "}
                  <Link href={`/events/${c.slug}/edit`} className="text-(--color-pine) underline">
                    edit this date
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
          {result.skipped?.length ? (
            <ul className="list-disc pl-5 text-rose-700">
              {result.skipped.map((s) => (
                <li key={s.date}>
                  {s.date}: {s.reason}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
