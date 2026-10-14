"use client";

import { useActionState } from "react";
import Link from "next/link";

import { addDatesAction, type AddDatesState } from "../actions";

const inputClass =
  "rounded-xl border border-(--color-sand-strong) bg-white px-3 py-2 text-sm outline-none focus:border-(--color-pine)";

export function AddDatesForm({
  seriesId,
  seriesType,
  instances,
  defaultTemplateId,
}: {
  seriesId: string;
  seriesType: string;
  instances: Array<{ id: string; label: string }>;
  defaultTemplateId: string;
}) {
  const [state, formAction, pending] = useActionState<AddDatesState, FormData>(addDatesAction, null);

  return (
    <form action={formAction} className="mt-8 space-y-4 rounded-2xl border border-(--color-sand-strong) bg-(--color-mist) p-5">
      <h2 className="font-serif text-xl text-slate-950">Add dates</h2>
      <p className="text-sm text-slate-600">
        Each date becomes a <strong>pending</strong> event copied from the series defaults and the template date
        below (title, description, image, segments, organizers). Review and publish them from the pending queue.
        {seriesType === "sequential" ? " New parts are numbered after the existing ones." : ""}
      </p>
      <input type="hidden" name="seriesId" value={seriesId} />

      <label className="flex flex-col gap-1 text-sm font-medium text-slate-800">
        Dates, one per line (2026-11-07 or 07.11.2026)
        <textarea name="dates" rows={4} required className={`${inputClass} font-mono`} placeholder={"2027-01-16\n2027-02-13"} />
      </label>

      <label className="flex flex-col gap-1 text-sm font-medium text-slate-800">
        Copy from
        <select name="templateEventId" defaultValue={defaultTemplateId} className={inputClass}>
          {instances.map((i) => (
            <option key={i.id} value={i.id}>{i.label}</option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-2 text-sm text-slate-800">
        <input type="checkbox" name="copyTeachers" />
        Same teachers every date. Leave off for rotating guest teachers: new dates then start with the series
        title and description, and you add each date&apos;s guest, title and class in Edit.
      </label>

      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-(--color-ink) px-5 py-2.5 text-sm font-semibold text-(--color-mist) disabled:opacity-50"
      >
        {pending ? "Adding…" : "Add dates"}
      </button>

      {state ? (
        <div className="space-y-2 text-sm">
          <p className="font-semibold text-slate-900">{state.message}</p>
          {state.created.length ? (
            <ul className="list-disc pl-5 text-slate-700">
              {state.created.map((c) => (
                <li key={c.shortId}>
                  {c.startDate}: <Link href="/admin/events/pending" className="text-(--color-pine) underline">{c.shortId}</Link>
                </li>
              ))}
            </ul>
          ) : null}
          {state.problems.length ? (
            <ul className="list-disc pl-5 text-rose-700">
              {state.problems.map((p) => <li key={p}>{p}</li>)}
            </ul>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
