import Link from "next/link";
import { notFound } from "next/navigation";

import { requireAdminUser } from "@/lib/admin-auth";
import { getSeriesDetail } from "@/lib/series";
import { AddDatesForm } from "./add-dates-form";
import { publishPendingDatesAction } from "../actions";

export default async function AdminSeriesDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminUser();
  const { id } = await params;
  const series = await getSeriesDetail(id);
  if (!series) notFound();

  const latest = series.instances[series.instances.length - 1];
  const pendingCount = series.instances.filter((e) => e.status === "pending").length;

  return (
    <section>
      <Link href="/admin/series" className="text-sm font-medium text-(--color-pine) hover:underline">
        ← All series
      </Link>
      <h1 className="mt-3 font-serif text-3xl text-slate-950">{series.title}</h1>
      <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{series.seriesType}</p>
      {series.description ? <p className="mt-3 max-w-2xl text-sm text-slate-600">{series.description}</p> : null}

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
