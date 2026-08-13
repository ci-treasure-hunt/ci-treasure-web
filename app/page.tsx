import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { EventsDashboard } from "@/components/events-dashboard";
import { getUpcomingEvents } from "@/lib/events";
import { getCountryLabel, getCountryLabelWithArticle } from "@/lib/event-display";
import { getVenueCountries } from "@/lib/venues";
import { getCommunityCountries } from "@/lib/communities";
import { getAllCountrySummaries } from "@/lib/country-pages";
import { SITE_URL } from "@/lib/site";
import { EntityIndex } from "@/components/entity-index";

export const revalidate = 3600;

const TITLE = "CI Treasure Hunt — Contact Improvisation Events Worldwide";
const DESCRIPTION =
  "A living map of Contact Improvisation events, communities, teachers & venues worldwide — find jams, festivals, workshops and intensives near you.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  // EventsDashboard's filters live in the URL via router.replace, not real <a href> links, so
  // Googlebot won't discover ?country=/?type=... through normal crawling — but a filtered URL
  // copied from the address bar and shared externally could still get indexed on its own
  // without this, diluting the canonical homepage across filter-combination URLs.
  alternates: { canonical: SITE_URL },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    siteName: "CI Treasure Hunt",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    // app/opengraph-image.jpg (site-default, Next.js file convention) applies
    // automatically since this page doesn't set its own openGraph.images.
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

function getTodayDateKey() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export default async function Home() {
  const [{ events, error }, venues, communities, countryPages] = await Promise.all([
    getUpcomingEvents(getTodayDateKey()),
    getVenueCountries(),
    getCommunityCountries(),
    getAllCountrySummaries(),
  ]);

  const countries = Array.from(new Set(events.map((event) => event.country))).sort((a, b) =>
    getCountryLabel(a).localeCompare(getCountryLabel(b)),
  );

  // Union across all three entity types, not just events - venues/communities each cover a
  // different (and, for communities, much larger) set of countries than events alone.
  const allCountriesCount = new Set([...countries, ...venues.countries, ...communities.countries]).size;

  return (
    <main className="min-h-screen bg-(--color-mist) text-slate-900">
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-5 py-8 sm:px-8 lg:px-10">

        {/* Hero */}
        <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="border-l-4 border-(--color-pine) pl-5 py-1">
            <h1 className="font-serif text-4xl tracking-tight text-slate-950 sm:text-5xl">
              Contact Improvisation events,{" "}
              <Link href="/venues" className="text-violet-600 underline underline-offset-4 hover:text-violet-800">
                venues
              </Link>{" "}
              &amp;{" "}
              <Link href="/communities" className="text-violet-600 underline underline-offset-4 hover:text-violet-800">
                communities
              </Link>
            </h1>
            <p className="mt-3 text-base text-slate-500 sm:text-lg">
              Browse {events.length} upcoming events across {countries.length} countries.
            </p>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/ci-hero.jpg"
            alt="Contact improvisation dancers"
            // This is the page's LCP element (confirmed via PageSpeed Insights) —
            // fetchPriority tells the browser to fetch it ahead of lower-priority
            // requests instead of discovering it at normal priority mid-render.
            fetchPriority="high"
            className="w-full h-52 rounded-2xl object-cover shadow-lg lg:w-72 xl:w-96 lg:h-52 xl:h-64"
          />
        </div>

        {error && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-950">
            {error}
          </div>
        )}

        {/* Suspense is required here because EventsDashboard calls useSearchParams(), not for
            data (events is already resolved above). Without a fallback matching the real
            dashboard's height, Next's streaming reveal pops the whole grid in at once — the
            content is parsed/styled ahead of time but sits height-0 until JS swaps it into
            place — which shoves everything below it (this section) down in one large layout
            shift. Confirmed via Playwright layout-shift trace against production. */}
        <Suspense fallback={<div className="h-[calc(100vh-270px)] min-h-[500px]" />}>
          <EventsDashboard events={events} />
        </Suspense>

        <EntityIndex
          basePath="/events"
          label="upcoming events"
          items={events.map((e) => ({
            slug: e.slug,
            name: e.title,
            country: getCountryLabel(e.country),
          }))}
        />

        <section className="mx-auto max-w-3xl border-t border-(--color-sand-strong) pt-8 text-slate-700">
          <h2 className="mb-4 font-serif text-2xl text-slate-950">What is Contact Improvisation?</h2>
          <div className="space-y-4 text-sm leading-7 sm:text-base">
            <p>
              Contact Improvisation (CI) is an improvised dance form. Two or more people move
              together through shared weight and momentum, rather than fixed steps or a set lead,
              staying connected through a rolling point of contact. Steve Paxton originated the
              form in 1972; Nancy Stark Smith became one of its most influential early developers,
              shaping much of what CI is today. It has since spread worldwide, practiced in
              studios, festivals, and open-air jams, as both a dance form and a somatic or
              movement research practice.
            </p>
          </div>

          <h2 className="mt-8 mb-4 font-serif text-2xl text-slate-950">About CI Treasure Hunt</h2>
          <div className="space-y-4 text-sm leading-7 sm:text-base">
            <p>
              CI Treasure Hunt is a global directory of Contact Improvisation festivals, jams,
              workshops, intensives, and retreats, along with the{" "}
              <Link href="/venues" className="text-violet-600 underline underline-offset-4 hover:text-violet-800">
                venues
              </Link>
              , teachers, and{" "}
              <Link href="/communities" className="text-violet-600 underline underline-offset-4 hover:text-violet-800">
                communities
              </Link>{" "}
              behind them. The directory currently lists {events.length} events,{" "}
              {venues.count} venues, and {communities.count} communities across{" "}
              {allCountriesCount} countries.
              {/* I-132 Step 2: folded into the same paragraph rather than its own line — a
                  standalone sentence read as an orphaned non-sequitur after the "planning travel"
                  paragraph. Reads naturally with just one country and scales to a short
                  comma-separated list as more ship, without needing a rewrite at 2-4. */}
              {countryPages.length > 0 && (
                <>
                  {" "}
                  New: country guides that bring communities, teachers, events, and venues
                  together in one place, starting with{" "}
                  {countryPages.map((c, i) => (
                    <span key={c.iso}>
                      {i > 0 && (i === countryPages.length - 1 ? " and " : ", ")}
                      <Link href={`/${c.slug}`} className="text-violet-600 underline underline-offset-4 hover:text-violet-800">
                        {getCountryLabelWithArticle(c.iso)}
                      </Link>
                    </span>
                  ))}
                  .
                </>
              )}
            </p>
            <p>
              Planning travel and want to find a jam or community wherever you go? Looking for
              your first jam, scouting the festival calendar for your next vacation or journey, or
              trying to find teachers and community near you? This is where to look.
            </p>
          </div>
        </section>
      </section>
    </main>
  );
}
