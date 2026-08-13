import { Metadata } from "next";
import Link from "next/link";

import { getAllCountrySummaries } from "@/lib/country-pages";
import { getCountryLabelWithArticle } from "@/lib/event-display";
import { getCountryFlag } from "@/lib/utils";
import { SITE_URL, SITE_OG_IMAGE } from "@/lib/site";

const TITLE = "Contact Improvisation Around the World";
const DESCRIPTION =
  "Contact Improvisation country by country: how the practice took root in each place, and the communities, teachers, events, and venues to find there today.";

export const metadata: Metadata = {
  // Brand suffix matches the site's dominant convention (/teachers, /newsletter, /imprint, and
  // every country page all append it) — /venues and /communities are the two outliers, not the rule.
  title: `${TITLE} — CI Treasure Hunt`,
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/countries` },
  // Explicit block, not inherited — see /venues' own comment on this: Next.js doesn't deep-merge
  // nested metadata keys, so skipping this points og:url at the homepage instead of this page.
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE_URL}/countries`,
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

// First sentence of the summary as a card teaser — cheap (no extra query, summaryText is already
// fetched by getAllCountrySummaries) and avoids truncating mid-word the way a bare character
// slice would.
function teaser(summaryText: string) {
  const firstSentence = summaryText.split(/(?<=[.!?])\s/)[0];
  return firstSentence.length > 200 ? `${firstSentence.slice(0, 197)}...` : firstSentence;
}

export default async function CountryGuidesPage() {
  const countries = (await getAllCountrySummaries()).sort((a, b) => a.label.localeCompare(b.label));

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Countries", item: `${SITE_URL}/countries` },
    ],
  };

  return (
    <main className="min-h-screen bg-(--color-mist) text-slate-900">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd).replace(/</g, "\\u003c") }}
      />
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-10 px-5 py-8 sm:px-8 lg:px-10">
        {/* Hero — same shape as the homepage's (accent rule + text, photo floated right at a
            fixed size). Deliberately not a new hero treatment: this page sits one click from the
            homepage and should read as the same site. */}
        <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="border-l-4 border-(--color-pine) py-1 pl-5">
            <h1 className="font-serif text-4xl tracking-tight text-slate-950 sm:text-5xl">
              Contact Improvisation around the world
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
              Contact Improvisation is a small, scattered, wonderfully international practice, and
              it isn&apos;t always easy to know where to look, whether you&apos;re landing
              somewhere new or getting to know the scene where you already live. Each guide covers
              one country: how CI took root there, the communities and teachers we&apos;ve found,
              and what&apos;s coming up.
            </p>
            <p className="mt-3 text-base text-slate-500">
              {countries.length} {countries.length === 1 ? "country" : "countries"} so far, with
              more on the way.
            </p>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/ci-hero.jpg"
            alt="Contact Improvisation dancers"
            fetchPriority="high"
            className="h-52 w-full rounded-2xl object-cover shadow-lg lg:h-52 lg:w-72 xl:h-64 xl:w-96"
          />
        </div>

        {countries.length === 0 ? (
          <p className="text-slate-500">No country guides published yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {countries.map((c) => (
              <Link
                key={c.iso}
                href={`/${c.slug}`}
                className="group flex flex-col rounded-2xl border border-(--color-sand-strong) bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-(--color-pine) hover:shadow-md"
              >
                <span className="mb-3 text-3xl leading-none" aria-hidden="true">
                  {getCountryFlag(c.iso)}
                </span>
                <h2 className="mb-2 font-serif text-xl text-slate-950">
                  Contact Improvisation in {getCountryLabelWithArticle(c.iso)}
                </h2>
                <p className="mb-4 text-sm leading-6 text-slate-600">{teaser(c.summaryText)}</p>
                <span className="mt-auto text-sm font-medium text-(--color-pine) group-hover:underline">
                  Read the guide →
                </span>
              </Link>
            ))}
          </div>
        )}

        {/* Ambassador CTA — same card idiom as the per-country ambassador box on
            app/[slug]/page.tsx (accent left border on the pale sand background), so the ask reads
            as the same standing invitation rather than a different offer. */}
        <div className="flex flex-col gap-6 rounded-2xl border border-(--color-sand-strong) border-l-4 border-l-(--color-pine) bg-(--color-sand) p-6 lg:flex-row lg:items-center lg:justify-between lg:gap-10">
          <div className="max-w-3xl">
            <h2 className="mb-2 font-serif text-xl text-slate-950">Help us cover your country</h2>
            <p className="text-base leading-7 text-slate-700">
              This list keeps growing. If your country isn&apos;t here yet, or you know its scene
              better than we do, we&apos;d love the help. Every country page has an open Ambassador
              spot for someone willing to keep it accurate as things change.
            </p>
          </div>
          <a
            href="mailto:hello@citreasurehunt.com"
            className="inline-block shrink-0 self-start rounded-lg bg-(--color-pine) px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90 lg:self-auto"
          >
            Get in touch →
          </a>
        </div>
      </section>
    </main>
  );
}
