import Link from "next/link";
import { notFound } from "next/navigation";

import { requireAdminUser } from "@/lib/admin-auth";
import { getSeriesDetail } from "@/lib/series";
import { getSeriesRenewalInfo, nextRenewalDates } from "@/lib/series-renewal";
import { AddDatesForm } from "./add-dates-form";
import { extendSeriesAction, publishPendingDatesAction, setSeriesRecurrenceAction } from "../actions";

export default async function AdminSeriesDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ extended?: string; until?: string; extendError?: string }>;
}) {
  await requireAdminUser();
  const { id } = await params;
  const { extended, until, extendError } = await searchParams;
  const series = await getSeriesDetail(id);
  if (!series) notFound();

  const latest = series.instances[series.instances.length - 1];
  const pendingCount = series.instances.filter((e) => e.status === "pending").length;
  const renewal = await getSeriesRenewalInfo(id);
  const renewalDates = renewal?.lastDate ? nextRenewalDates(renewal.lastDate, renewal.stepDays) : [];
  const currentRepeat =
    series.recurrenceRule === "FREQ=WEEKLY;INTERVAL=1" ? "weekly" : series.recurrenceRule === "FREQ=WEEKLY;INTERVAL=2" ? "biweekly" : "";

  return (
    <section>
      <Link href="/admin/series" className="text-sm font-medium text-(--color-pine) hover:underline">
        ← All series
      </Link>
      <h1 className="mt-3 font-serif text-3xl text-slate-950">{series.title}</h1>
      <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{series.seriesType}</p>
      {series.description ? <p className="mt-3 max-w-2xl text-sm text-slate-600">{series.description}</p> : null}

      {series.seriesType === "recurring" ? (
        <div className="mt-6 rounded-2xl border border-(--color-sand-strong) bg-(--color-mist) p-4 text-sm">
          <h2 className="font-semibold text-slate-950">Keeps going (I-171 DEC-3b)</h2>
          {extended ? (
            <p className="mt-2 text-emerald-800">
              Added {extended} dates{until ? `, until ${until}` : ""}.
            </p>
          ) : null}
          {extendError ? <p className="mt-2 text-rose-800">{extendError}</p> : null}
          <form action={setSeriesRecurrenceAction} className="mt-3 flex flex-wrap items-center gap-3">
            <input type="hidden" name="seriesId" value={series.id} />
            <select name="repeat" defaultValue={currentRepeat} className="rounded-xl border border-(--color-sand-strong) bg-white px-3 py-2">
              <option value="">No pattern (ends after its last date)</option>
              <option value="weekly">Every week, keeps going</option>
              <option value="biweekly">Every 2 weeks, keeps going</option>
            </select>
            <button type="submit" className="rounded-full border border-(--color-ink) px-4 py-2 text-xs font-semibold">
              Save pattern
            </button>
          </form>
          {renewal ? (
            renewalDates.length ? (
              <form action={extendSeriesAction} className="mt-3">
                <input type="hidden" name="seriesId" value={series.id} />
                <button type="submit" className="rounded-full bg-(--color-ink) px-4 py-2 text-xs font-semibold text-(--color-mist)">
                  Extend 6 months: {renewalDates.length} dates, {renewalDates[0]} to {renewalDates[renewalDates.length - 1]}
                </button>
              </form>
            ) : (
              <p className="mt-3 text-slate-600">Already has dates for the next six months.</p>
            )
          ) : null}
          <p className="mt-3 text-xs text-slate-500">
            With a pattern, the owner gets &ldquo;Still running?&rdquo; emails four weeks and one week before the last
            date. New dates copy the latest date and go live at once if the series was published before.
          </p>
        </div>
      ) : null}

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-serif text-xl text-slate-950">Dates</h2>
        {pendingCount ? (
          <form action={publishPendingDatesAction}>
            <input type="hidden" name="seriesId" value={series.id} />
            <button type="submit" className="rounded-full bg-(--color-ink) px-4 py-2 text-xs font-semibold text-(--color-mist)">
              Publish {pendingCount} pending {pendingCount === 1 ? "date" : "dates"}
            </button>
          </form>
        ) : null}
      </div>
      <div className="mt-3 space-y-2">
        {series.instances.map((e) => (
          <div
            key={e.id}
            className="grid gap-2 rounded-2xl bg-(--color-mist) p-3 text-sm text-slate-900 sm:grid-cols-[110px_1fr_200px_100px_60px] sm:items-center"
          >
            <span className="font-medium">{e.startDate}{e.endDate !== e.startDate ? ` → ${e.endDate}` : ""}</span>
            <span className="min-w-0 truncate">
              {e.seriesOrder ? `${e.seriesOrder}. ` : ""}
              {e.title} <span className="text-slate-400">({e.shortId})</span>
            </span>
            <span className="truncate text-slate-600">{e.teachers.join(", ") || "no teachers"}</span>
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{e.status}</span>
            <Link href={`/admin/events/${e.id}/edit`} className="text-xs font-semibold text-(--color-pine) hover:underline">
              Edit
            </Link>
          </div>
        ))}
      </div>

      {latest ? (
        <AddDatesForm
          seriesId={series.id}
          seriesType={series.seriesType}
          instances={series.instances.map((e) => ({ id: e.id, label: `${e.startDate} · ${e.title}` }))}
          defaultTemplateId={latest.id}
        />
      ) : null}

      <details className="mt-8 text-sm text-slate-600">
        <summary className="cursor-pointer font-semibold">Series defaults (copied into new dates)</summary>
        <pre className="mt-3 overflow-x-auto rounded-2xl bg-(--color-mist) p-4 text-xs">
          {JSON.stringify(series.defaults, null, 2)}
        </pre>
      </details>
    </section>
  );
}
