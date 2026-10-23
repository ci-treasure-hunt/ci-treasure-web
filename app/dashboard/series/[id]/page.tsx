import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { buildEventSlug } from "@/lib/events";
import { getSeriesDetail } from "@/lib/series";
import { canManageSeries } from "@/lib/series-access";
import { createClient } from "@/lib/supabase/server";

import { SeriesAddDatesForm } from "./add-dates-form";

const STATUS_STYLES: Record<string, string> = {
  published: "bg-emerald-100 text-emerald-800",
  pending: "bg-amber-100 text-amber-800",
  archived: "bg-slate-100 text-slate-500",
  rejected: "bg-rose-100 text-rose-800",
};

// I-171: an organizer's view of one of their series, with every date and a form to add more.
export default async function DashboardSeriesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/auth?next=/dashboard/series/${id}`);

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, is_trusted")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!(await canManageSeries(supabase, user.id, profile?.id ?? null, id))) redirect("/dashboard");

  const series = await getSeriesDetail(id);
  if (!series) notFound();

  const latest = series.instances[series.instances.length - 1];
  const today = new Date().toISOString().slice(0, 10);

  return (
    <main className="min-h-screen bg-(--color-mist) px-5 py-6 text-slate-900 sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <Link href="/dashboard" className="text-sm font-medium text-(--color-pine) hover:underline">
          ← Back to your dashboard
        </Link>

        <section className="rounded-[1.75rem] border border-white/80 bg-white/90 p-6 shadow-[0_18px_55px_rgba(106,75,25,0.08)]">
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-(--color-pine)">Your series</p>
          <h1 className="mt-2 font-serif text-3xl text-slate-950">{series.title}</h1>
          <p className="mt-2 text-sm text-slate-600">
            Every date is its own event, so you can still change the time, teachers or text of one date with
            Edit. To change the text, price or links of all upcoming dates at once, edit any one of them and
            tick “Also apply my changes” next to Save. Past dates stay listed for the record.
          </p>

          <ul className="mt-5 divide-y divide-(--color-sand-strong)">
            {series.instances.map((i) => {
              const status = i.endDate < today && i.status === "published" ? "archived" : i.status;
              return (
                <li key={i.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold text-slate-950">{i.startDate}</p>
                    <p className="text-sm text-slate-600">
                      {i.title}
                      {i.teachers.length ? ` · ${i.teachers.join(", ")}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${STATUS_STYLES[status] ?? "bg-slate-100 text-slate-700"}`}
                    >
                      {status}
                    </span>
                    <Link
                      href={`/events/${buildEventSlug(i.shortId, i.title)}/edit`}
                      className="rounded-full border border-(--color-sand-strong) px-4 py-2 text-sm font-medium text-slate-700 hover:border-(--color-pine) hover:text-(--color-pine)"
                    >
                      Edit
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <SeriesAddDatesForm
          seriesId={series.id}
          seriesTitle={series.title}
          latest={latest ? { date: latest.startDate, title: latest.title, teachers: latest.teachers } : null}
          trusted={Boolean(profile?.is_trusted)}
        />
      </div>
    </main>
  );
}
