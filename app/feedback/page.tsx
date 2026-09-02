import Script from "next/script";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Feedback — CI Treasure Hunt",
  description:
    "Tell us what CI Treasure Hunt should become. A short anonymous survey, plus how to send a correction or a listing we are missing.",
};

export default function FeedbackPage() {
  return (
    <main className="min-h-screen bg-(--color-mist)">
      <section className="mx-auto w-full max-w-2xl px-5 py-10 sm:px-8">
        {/* The embed below is a research survey (what the site is for, what it should become),
            not an intake form: it can't take a bug report or a missing listing, and most of its
            questions are required. The copy used to promise exactly those things, which sent
            people into a questionnaire when they wanted to report a broken date. Until there is a
            real intake form, say what each route is actually for. */}
        <div className="mb-8 border-l-4 border-(--color-pine) pl-5 py-1">
          <h1 className="font-serif text-3xl tracking-tight text-slate-950 sm:text-4xl">Feedback</h1>
          <p className="mt-2 text-base text-slate-500">
            A few questions about what CI Treasure Hunt is for and what it should become. Anonymous,
            about five minutes. CI Treasure Hunt is maintained by one person, so your answers go
            straight to Jan, not a support queue.
          </p>
          <p className="mt-3 text-base text-slate-500">
            Reporting something specific instead, a wrong date, a broken link, an event, a jam or a
            community we are missing? Email{" "}
            <a
              href="mailto:hello@citreasurehunt.com"
              className="text-(--color-pine) hover:underline"
            >
              hello@citreasurehunt.com
            </a>{" "}
            and it gets fixed. Organizers can also{" "}
            <Link href="/events/new" className="text-(--color-pine) hover:underline">
              submit an event directly
            </Link>
            .
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
          <iframe
            data-tally-src="https://tally.so/embed/yPzK4B?alignLeft=1&hideTitle=1&transparentBackground=1&dynamicHeight=1"
            loading="lazy"
            width="100%"
            height="500"
            style={{ border: 0 }}
            title="Feedback"
          />
        </div>
      </section>

      <Script src="https://tally.so/widgets/embed.js" strategy="lazyOnload" />
    </main>
  );
}
