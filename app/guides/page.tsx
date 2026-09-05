import type { Metadata } from "next";
import Link from "next/link";

import { getAllGuides } from "@/lib/guides";
import { SITE_OG_IMAGE, SITE_URL } from "@/lib/site";

const TITLE = "Contact Improvisation Guides";
const DESCRIPTION =
  "Guides to Contact Improvisation: what it is, what the words mean, how it differs from other practices, what happens at a jam, and how to find it where you live.";

export const metadata: Metadata = {
  title: `${TITLE} — CI Treasure Hunt`,
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/guides` },
  // Explicit block, not inherited — Next.js doesn't deep-merge nested metadata keys, so omitting
  // this points og:url at the homepage. Same note as /countries and /venues.
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE_URL}/guides`,
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

export default async function GuidesPage() {
  const guides = await getAllGuides();

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Guides", item: `${SITE_URL}/guides` },
    ],
  };

  // ItemList so the set is legible to crawlers as an ordered collection rather than seven
  // unrelated cards. Cheap, and it matches the reading order the page actually presents.
  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: guides.map((g, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: g.frontmatter.title,
      url: `${SITE_URL}/guides/${g.frontmatter.slug}`,
    })),
  };

  return (
    <main className="min-h-screen bg-(--color-mist) text-slate-900">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd).replace(/</g, "\\u003c") }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd).replace(/</g, "\\u003c") }}
      />
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-10 px-5 py-8 sm:px-8 lg:px-10">
        {/* Same hero shape as /countries (accent rule + text, photo floated right at a fixed
            size), so the two hub pages read as siblings rather than as different sites. */}
        <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="border-l-4 border-(--color-pine) py-1 pl-5">
            <h1 className="font-serif text-4xl tracking-tight text-slate-950 sm:text-5xl">
              Contact Improvisation Guides
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
              Contact Improvisation is easier to do than to look up. There is no governing body, no
              official curriculum, and most of what a newcomer needs to know gets passed on in
              person. These guides write some of it down: what the practice is, what the words
              mean, what happens at a jam, and how to find one.
            </p>
            <p className="mt-3 text-base text-slate-500">
              {guides.length} {guides.length === 1 ? "guide" : "guides"} so far, with more on the
              way.
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

        {guides.length === 0 ? (
          <p className="text-slate-500">No guides published yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {guides.map((g) => (
              <Link
                key={g.frontmatter.slug}
                href={`/guides/${g.frontmatter.slug}`}
                className="group flex flex-col rounded-2xl border border-(--color-sand-strong) bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-(--color-pine) hover:shadow-md"
              >
                <h2 className="mb-2 font-serif text-xl text-slate-950">{g.frontmatter.title}</h2>
                <p className="mb-4 text-sm leading-6 text-slate-600">
                  {g.frontmatter.description}
                </p>
                <span className="mt-auto flex items-center justify-between gap-3 text-sm font-medium text-(--color-pine)">
                  <span className="group-hover:underline">Read the guide →</span>
                  <span className="font-normal text-slate-400">{g.readingMinutes} min</span>
                </span>
              </Link>
            ))}
          </div>
        )}

        {/* Guides are the top of the funnel; the directory is the thing they exist to feed.
            Without this the cluster links almost entirely to itself (55 guide-to-guide links
            against 6 to product pages, counted 2026-08-31). */}
        <div className="flex flex-col gap-6 rounded-2xl border border-(--color-sand-strong) border-l-4 border-l-(--color-pine) bg-(--color-sand) p-6 lg:flex-row lg:items-center lg:justify-between lg:gap-10">
          <div className="max-w-3xl">
            <h2 className="mb-2 font-serif text-xl text-slate-950">Looking for somewhere to dance?</h2>
            <p className="text-base leading-7 text-slate-700">
              The rest of the site is the directory these guides point at: jams, festivals,
              teachers, venues and local communities, country by country.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-3">
            <Link
              href="/"
              className="inline-block rounded-lg bg-(--color-pine) px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
            >
              Browse events →
            </Link>
            <Link
              href="/communities"
              className="inline-block rounded-lg border border-(--color-sand-strong) bg-white px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:border-(--color-pine) hover:text-(--color-pine)"
            >
              Find a community
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
