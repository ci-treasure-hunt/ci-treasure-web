import { Metadata } from "next";
import { Suspense } from "react";
import { Globe, MapPin } from "lucide-react";
import { getVenues } from "@/lib/venues";
import { VenuesClient } from "./venues-client";
import { SITE_URL, SITE_OG_IMAGE } from "@/lib/site";

const TITLE = "CI Venues Worldwide";
const DESCRIPTION =
  "Discover Contact Improvisation venues around the world, a curated, hand-maintained directory of spaces that host CI jams, classes, workshops, and festivals.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  // Same reasoning as /communities: filters live in the URL via client-side history
  // navigation, not real links, but a shared filtered URL could still get indexed without this.
  alternates: { canonical: `${SITE_URL}/venues` },
  // Without its own openGraph block this page inherited the root layout's wholesale (Next.js
  // doesn't deep-merge nested metadata keys) — og:title "CI Treasure Hunt" and og:url pointing at
  // the homepage, not this page. Same bug fixed on /communities below (I-150).
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE_URL}/venues`,
    siteName: "CI Treasure Hunt",
    type: "website",
    images: [{ url: SITE_OG_IMAGE, width: 1280, height: 1024, type: "image/jpeg" }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: [SITE_OG_IMAGE],
  },
};

export const revalidate = 3600;

export default async function VenuesPage() {
  const { venues, countries, venueCount, countryCount, error } = await getVenues();

  return (
    <main className="min-h-screen bg-(--color-mist) px-5 py-10 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-7xl">
        {/* Rendered server-side, outside the Suspense boundary below, so crawlers that don't
            execute client JS still see the H1 and page content — see I-150 (Ahrefs H1 finding). */}
        <header className="mb-8">
          <h1 className="mb-3 font-serif text-3xl text-slate-900 md:text-5xl">
            CI Venues Worldwide
          </h1>
          <p className="mb-6 max-w-2xl text-lg text-slate-600">
            A curated directory of spaces that regularly host Contact Improvisation, jams, classes,
            workshops, and festivals. Each venue is researched and verified by hand, not scraped
            automatically, so listings stay accurate as spaces open, close, or change hands.
          </p>
          <div className="flex justify-start gap-8 text-sm font-medium text-slate-700">
            <span className="flex items-center gap-2">
              <Globe className="size-4 text-(--color-pine)" />
              {venueCount} venues
            </span>
            <span className="flex items-center gap-2">
              <MapPin className="size-4 text-slate-400" />
              {countryCount} countries
            </span>
          </div>
        </header>

        {/* Suspense is required here because VenuesClient calls useSearchParams(), not for data
            (venues is already resolved above). Without a fallback, Next's streaming reveal pops the
            whole grid in at once, shoving the footer down — same root cause as the homepage CLS bug
            (I-136). Venues has no fixed-height dashboard to mirror exactly, but min-h-screen matches
            the real content's own base height, closing most of the gap. */}
        <Suspense fallback={<div className="min-h-screen" />}>
          <VenuesClient
            initialVenues={venues}
            initialCountries={countries}
            initialError={error}
          />
        </Suspense>
      </div>
    </main>
  );
}
