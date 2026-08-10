import { Metadata } from "next";
import { Suspense } from "react";
import { Globe, MapPin } from "lucide-react";
import { getCommunities } from "@/lib/communities";
import { CommunitiesClient } from "./communities-client";
import { SITE_URL, SITE_OG_IMAGE, TELEGRAM_URL } from "@/lib/site";

const TITLE = "CI Communities Worldwide";
const DESCRIPTION =
  "Discover Contact Improvisation communities around the world, find local jams, teacher networks, and groups, plus the channels that connect you locally.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  // Filter state (country/type/etc.) lives in the URL via router.replace, not real <a href>
  // links — Googlebot won't discover ?country=SE... through normal crawling, but a filtered
  // URL copied from the address bar and shared externally could still get indexed on its own
  // without this, diluting the canonical /communities page across filter-combination URLs.
  alternates: { canonical: `${SITE_URL}/communities` },
  // Without its own openGraph block this page inherited the root layout's wholesale (Next.js
  // doesn't deep-merge nested metadata keys) — og:title "CI Treasure Hunt" and og:url pointing at
  // the homepage, not this page. Same bug fixed on /venues above (I-150).
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE_URL}/communities`,
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

export default async function CommunitiesPage() {
  const { communities, countries, communityCount, countryCount, error } =
    await getCommunities();

  return (
    <main className="min-h-screen overflow-x-hidden bg-(--color-mist) px-5 py-10 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-7xl">
        {/* Rendered server-side, outside the Suspense boundary below, so crawlers that don't
            execute client JS still see the H1 and page content — see I-150 (Ahrefs H1 finding). */}
        <header className="mb-8">
          <h1 className="mb-3 font-serif text-3xl text-slate-900 md:text-5xl">
            CI Communities Worldwide
          </h1>
          <p className="mb-6 max-w-2xl text-lg text-slate-600">
            Explore Contact Improvisation communities around the globe and find the public channels, websites, and resources that help you connect locally.
          </p>
          <div className="flex justify-start gap-8 text-sm font-medium text-slate-700">
            <span className="flex items-center gap-2">
              <Globe className="size-4 text-(--color-pine)" />
              {communityCount} communities
            </span>
            <span className="flex items-center gap-2">
              <MapPin className="size-4 text-slate-400" />
              {countryCount} countries
            </span>
          </div>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-500">
            Invite links to Telegram, WhatsApp, and Signal groups are protected by a quick
            verification check to keep spam bots out. Questions, or a link not working?{" "}
            <a
              href={TELEGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-(--color-pine) underline decoration-(--color-pine)/35 underline-offset-4"
            >
              Join our Telegram group
            </a>
            .
          </p>
        </header>

        {/* Same fix as venues/page.tsx and the original homepage CLS bug (I-136): Suspense is
            required for useSearchParams(), not data, but a bare fallback lets the real content pop
            in all at once and shove the footer down. min-h-screen matches the real content's own
            base height. */}
        <Suspense fallback={<div className="min-h-screen" />}>
          <CommunitiesClient
            initialCommunities={communities}
            initialCountries={countries}
            initialError={error}
          />
        </Suspense>
      </div>
    </main>
  );
}
