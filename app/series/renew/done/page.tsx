import type { Metadata } from "next";
import Link from "next/link";

// I-171 DEC-3b: after an answer on the reminder page. Rendered from the query only: the token is
// used up by then.
export const metadata: Metadata = {
  title: "Thank you — CI Treasure Hunt",
  robots: { index: false, follow: false },
};

function formatDay(iso: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default async function SeriesRenewDonePage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; title?: string; until?: string; live?: string }>;
}) {
  const { state, title, until, live } = await searchParams;
  const name = (title ?? "").slice(0, 200);
  const day = formatDay(until ?? "");

  return (
    <main className="min-h-screen bg-(--color-mist) px-5 py-10 text-slate-900 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-2xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        {state === "stopped" ? (
          <>
            <h1 className="font-serif text-3xl tracking-tight text-slate-950">Thank you for letting us know</h1>
            <p className="mt-3 text-base text-slate-700">
              {name ? <strong>{name}</strong> : "The series"} stays listed{day ? ` until ${day}` : ""} and then ends.
              We will not ask again. If it starts again, you can add new dates from your dashboard.
            </p>
          </>
        ) : (
          <>
            <h1 className="font-serif text-3xl tracking-tight text-slate-950">Thank you, it is extended!</h1>
            <p className="mt-3 text-base text-slate-700">
              {name ? <strong>{name}</strong> : "The series"} is now listed{day ? ` until ${day}` : " for the next six months"}.
              {live === "1"
                ? " The new dates are live."
                : " The new dates go live once we have checked them, usually within a day."}{" "}
              We will ask again before the last date.
            </p>
          </>
        )}
        <p className="mt-6 text-sm text-slate-600">
          <Link href="/dashboard" className="font-medium text-(--color-pine) underline">
            Go to your dashboard
          </Link>{" "}
          to change single dates, teachers or text.
        </p>
      </div>
    </main>
  );
}
