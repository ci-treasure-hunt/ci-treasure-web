import type { Metadata } from "next";

import { findSeriesByRenewalToken, nextRenewalDates } from "@/lib/series-renewal";

import { confirmSeriesRenewal, declineSeriesRenewal } from "./actions";

// I-171 DEC-3b: where the "Still running?" reminder email lands. Opening the page changes nothing
// (mail scanners open links); only the buttons act.
export const metadata: Metadata = {
  title: "Still running? — CI Treasure Hunt",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function formatDay(iso: string) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default async function SeriesRenewPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ state?: string }>;
}) {
  const { token } = await params;
  const { state } = await searchParams;
  const info = state === "invalid" ? null : await findSeriesByRenewalToken(token);

  return (
    <main className="min-h-screen bg-(--color-mist) px-5 py-10 text-slate-900 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-2xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        {!info ? (
          <>
            <h1 className="font-serif text-3xl tracking-tight text-slate-950">This link has already been used</h1>
            <p className="mt-3 text-base text-slate-700">
              The series was probably extended already, or a newer reminder replaced this one. You can always add
              dates from your dashboard, or write to hello@citreasurehunt.com.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-(--color-pine)">Still running?</p>
            <h1 className="mt-2 font-serif text-3xl tracking-tight text-slate-950">{info.title}</h1>
            {state === "error" ? (
              <p className="mt-3 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-800">
                Something went wrong adding the dates. Please try again, or write to hello@citreasurehunt.com.
              </p>
            ) : null}
            <p className="mt-3 text-base text-slate-700">
              {info.lastDate ? (
                <>
                  The last date we list is <strong>{formatDay(info.lastDate)}</strong>.{" "}
                </>
              ) : null}
              If it is still running, one click adds the next six months
              {info.lastDate
                ? (() => {
                    const next = nextRenewalDates(info.lastDate, info.stepDays);
                    return next.length ? `, until ${formatDay(next[next.length - 1])}` : "";
                  })()
                : ""}
              . Same day, time, place and teachers as the last date; you can still change single dates afterwards.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <form action={confirmSeriesRenewal}>
                <input type="hidden" name="token" value={token} />
                <button
                  type="submit"
                  className="w-full rounded-full bg-(--color-pine) px-5 py-3 text-sm font-semibold text-white hover:opacity-90 sm:w-auto"
                >
                  Yes, still running: extend 6 months
                </button>
              </form>
              <form action={declineSeriesRenewal}>
                <input type="hidden" name="token" value={token} />
                <button
                  type="submit"
                  className="w-full rounded-full border border-(--color-sand-strong) px-5 py-3 text-sm font-medium text-slate-700 hover:border-(--color-pine) sm:w-auto"
                >
                  It has stopped
                </button>
              </form>
            </div>
            <p className="mt-4 text-sm text-slate-600">
              If it has stopped, the listing simply ends after its last date. Nothing is deleted.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
