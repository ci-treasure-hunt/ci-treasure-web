import Link from "next/link";

import { requireAdminUser } from "@/lib/admin-auth";
import { listSeries } from "@/lib/series";
import { createSeriesAction } from "./actions";

const inputClass =
  "rounded-xl border border-(--color-sand-strong) bg-white px-3 py-2 text-sm outline-none focus:border-(--color-pine)";

export default async function AdminSeriesPage() {
  await requireAdminUser();
  const series = await listSeries();

  return (
    <section>
      <h1 className="font-serif text-3xl text-slate-950">Series</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-600">
        Recurring series (a monthly class, a weekly jam) collapse to one row in public lists; sequential
        series (modules of one programme) list every part. Open a series to add dates.
      </p>

      <form
        action={createSeriesAction}
        className="mt-6 flex flex-wrap items-end gap-3 rounded-2xl border border-(--color-sand-strong) bg-(--color-mist) p-4"
      >
        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          From event (short ID)
          <input name="shortId" required placeholder="RhMW" className={`${inputClass} w-32 normal-case tracking-normal`} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          Series title
          <input name="title" placeholder="Defaults to the event title" className={`${inputClass} w-72 normal-case tracking-normal`} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          Type
          <select name="seriesType" defaultValue="recurring" className={`${inputClass} normal-case tracking-normal`}>
            <option value="recurring">recurring</option>
            <option value="sequential">sequential</option>
          </select>
        </label>
        <button type="submit" className="rounded-full bg-(--color-ink) px-5 py-2.5 text-sm font-semibold text-(--color-mist)">
          New series
        </button>
      </form>

      <div className="mt-6 space-y-3">
        {series.map((s) => (
          <Link
            key={s.id}
            href={`/admin/series/${s.id}`}
            className="grid gap-2 rounded-2xl bg-(--color-mist) p-4 text-sm text-slate-900 shadow-[0_10px_30px_rgba(106,75,25,0.05)] hover:ring-1 hover:ring-(--color-pine) sm:grid-cols-[1fr_110px_150px_120px] sm:items-center"
          >
            <span className="font-medium">{s.title}</span>
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{s.seriesType}</span>
            <span className="text-slate-600">
              {s.upcoming} upcoming / {s.total} total
            </span>
            <span className="text-slate-600">{s.nextDate ? `next ${s.nextDate}` : "no upcoming date"}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
