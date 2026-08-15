import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MapPin } from "lucide-react";

import { CountryCombinedMap } from "@/components/country-combined-map";
import { EventCard } from "@/components/event-card";
import { ExpandableList } from "@/components/expandable-list";
import { CompactCommunityRow, CompactTeacherRow } from "@/components/compact-entity-row";
import { VenueCard } from "@/components/entity-cards";
import { COMMUNITY_SUBMIT_URL, getPrimaryJoinUrl, type Community } from "@/lib/communities";
import { getAllCountrySlugs, getAllCountrySummaries, getCountryPageData } from "@/lib/country-pages";
import { getCountryLabelWithArticle } from "@/lib/event-display";
import { getCountryFlag } from "@/lib/utils";
import { SITE_URL } from "@/lib/site";

export const revalidate = 3600;

type CountryPageProps = {
  params: Promise<{ slug: string }>;
};

// I-132: generateStaticParams is scoped to country_summaries rows, so an unmatched slug 404s
// rather than rendering — required since this is a root-level catch-all route sitting alongside
// /venues, /teachers, /newsletter, etc. A country only gets a live page, a sitemap entry
// (app/sitemap.ts), and a homepage link (app/page.tsx) once it has a reviewed row here — see
// docs/issues/i-132-country-pages.md.
export async function generateStaticParams() {
  const slugs = await getAllCountrySlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: CountryPageProps): Promise<Metadata> {
  const { slug } = await params;
  const country = await getCountryPageData(slug);
  if (!country) return {};

  // Sliced to 160 as a safety net: length varies with the country name (e.g. "Bosnia and
  // Herzegovina" alone pushes this past the target band), and nothing currently populated is
  // long enough to matter, but a future long country name shouldn't silently regress this.
  const labelWithArticle = getCountryLabelWithArticle(country.iso);
  const description = `Contact Improvisation in ${labelWithArticle}: find local communities, teachers, upcoming events, and venues, the full CI Treasure Hunt directory for ${labelWithArticle}.`.slice(0, 160);
  const title = `Contact Improvisation in ${labelWithArticle}`;
  return {
    title: `${title} — CI Treasure Hunt`,
    description,
    alternates: {
      canonical: `${SITE_URL}/${country.slug}`,
    },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/${country.slug}`,
      siteName: "CI Treasure Hunt",
      type: "website",
      // No `images` here — opengraph-image.tsx (this same route segment) generates a
      // country-specific image (flag, title, live stats) and Next.js's file-convention metadata
      // owns the og:image tags for this segment. Setting images here too would create two
      // competing sources for the same tag.
    },
    // Root layout's default twitter: block is worldwide/generic — without this override every
    // country page's card on X/Twitter would say "CI Treasure Hunt" instead of naming the
    // country, undermining the one channel (external CI orgs sharing their own country link)
    // this whole feature is meant to earn. Image itself comes from twitter-image.tsx, same
    // reasoning as openGraph above.
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

// A summary may end with a trailing "Sources:" block citing where its history came from (Spain is
// the first, backed by two peer-reviewed papers). Kept inside summary_text rather than given its own
// column: it's prose the author writes and edits in one place, and only a minority of countries will
// ever have one. Split out here purely so the citations can render smaller and quieter than the body
// — a country without the marker is unaffected and renders exactly as before.
function splitSummarySources(text: string): [string, string | null] {
  const marker = text.lastIndexOf("\n\nSources:");
  if (marker === -1) return [text, null];
  return [text.slice(0, marker), text.slice(marker + 2)];
}

export default async function CountryPage({ params }: CountryPageProps) {
  const { slug } = await params;
  const country = await getCountryPageData(slug);
  if (!country) notFound();

  const { label, iso, summaryText, summaryUpdatedAt, nationalCommunities, communities, teachers, events, venues, mapMarkers } = country;
  const [summaryBody, summarySources] = splitSummarySources(summaryText);
  const flag = getCountryFlag(iso);
  const labelWithArticle = getCountryLabelWithArticle(iso);

  // Cross-links to other live country guides — same "comma-separated, 'and' before the last"
  // pattern as the homepage's own country-guide sentence (app/page.tsx), so it scales the same
  // way from 1 to N other countries without a copy rewrite at 2-4.
  const otherCountries = (await getAllCountrySummaries())
    .filter((c) => c.iso !== iso)
    .sort((a, b) => a.label.localeCompare(b.label));

  // Schema-only breadcrumb (I-132 follow-up, 2026-07-27): describes the page's position in the
  // site hierarchy independent of any visible trail. Deliberately decoupled from the visible
  // breadcrumb UI, which stays gated behind Step 2 (linking) — Google reads BreadcrumbList
  // structured data on its own terms, it doesn't require an on-page element to match it. Has no
  // practical effect until the page is actually crawled (Step 2 also adds the sitemap entry),
  // but costs nothing to ship now rather than bundling it with the visible-UI gate.
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: label, item: `${SITE_URL}/${slug}` },
    ],
  };

  return (
    <main className="min-h-screen bg-(--color-mist) px-5 py-10 sm:px-8 lg:px-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd).replace(/</g, "\\u003c") }}
      />
      <div className="mx-auto max-w-5xl">
        <header className="mb-10">
          <h1 className="mb-4 font-serif text-3xl text-slate-900 md:text-5xl">
            {flag ? `${flag} ` : ""}Contact Improvisation in {labelWithArticle}
          </h1>

          {/* Stat strip: bold counts + small labels, not a plain inline text row — gives
              search snippets and quick scanners something concrete to grab onto. Each stat links
              down to its own section (matching anchor id) when that section actually renders;
              a stat reading 0 has nothing to jump to, so it stays a plain box instead of a dead link. */}
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(
              [
                ["communities", communities.length + nationalCommunities.length, "communities"],
                ["teachers", teachers.length, "teachers"],
                ["upcoming events", events.length, "events"],
                ["venues", venues.length, "venues"],
              ] as const
            ).map(([labelText, count, anchorId]) => {
              const content = (
                <>
                  <p className="font-serif text-xl text-slate-900">{count}</p>
                  <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">{labelText}</p>
                </>
              );
              return count > 0 ? (
                <a
                  key={labelText}
                  href={`#${anchorId}`}
                  className="rounded-xl border border-(--color-sand-strong) bg-white px-4 py-2.5 text-center transition hover:border-(--color-pine) hover:shadow-sm"
                >
                  {content}
                </a>
              ) : (
                <div key={labelText} className="rounded-xl border border-(--color-sand-strong) bg-white px-4 py-2.5 text-center">
                  {content}
                </div>
              );
            })}
          </div>

          {/* Map fixed-size and floated top-right, text flows around/below it — deliberately
              not a grid, so the map's size and the summary text's length are fully decoupled.
              A grid that stretches both to equal height makes the map inherit however long the
              text is (bad: a 3-paragraph summary produced a huge, over-zoomed-out map); a grid
              that fixes the map's height independently leaves an empty gutter under whichever
              column is shorter. A float has neither failure mode: short text just leaves the
              map extending a bit further down (normal, reads as an inset illustration, not a
              layout bug), and long text simply continues at full width once it clears the
              float's bottom edge. `flow-root` on the wrapper is the modern non-hacky way to
              stop the section from collapsing its height around the floated child. */}
          <div className="flow-root">
            {mapMarkers.length > 0 && (
              <div className="mb-6 h-80 w-full overflow-hidden rounded-2xl border border-(--color-sand-strong) lg:float-right lg:mb-4 lg:ml-8 lg:h-[420px] lg:w-[420px]">
                <CountryCombinedMap markers={mapMarkers} />
              </div>
            )}
            <h2 className="mb-2 font-serif text-xl text-slate-900">Overview</h2>
            <p className="text-lg leading-8 whitespace-pre-line text-slate-700">
              {summaryBody}
            </p>
            {summarySources && (
              <p className="mt-5 text-xs leading-5 whitespace-pre-line text-slate-500">
                {summarySources}
              </p>
            )}
            <p className="mt-2 text-xs text-slate-400">
              Last updated{" "}
              {new Date(summaryUpdatedAt).toLocaleDateString("en-GB", {
                month: "long",
                year: "numeric",
              })}
            </p>
          </div>
        </header>

        {(nationalCommunities.length > 0 || communities.length > 0) && (
          // Single anchor wraps both the national-spotlight and general communities blocks —
          // the stat strip's "communities" count is their combined total, so it should jump to
          // wherever the first of the two actually renders, not just one or the other.
          <div id="communities" className="scroll-mt-6">
            {nationalCommunities.length > 0 && (
              <section className="mb-8">
                <h2 className="mb-3 font-serif text-xl text-slate-900">National community</h2>
                <div className="space-y-3">
                  {nationalCommunities.map((c) => (
                    <NationalCommunitySpotlight key={c.id} community={c} />
                  ))}
                </div>
              </section>
            )}

            {/* Communities and Teachers are stacked full-width, not paired side by side — a
                5-row list next to a 13-row list (Sweden today) or a 25-row list next to a 39-row
                list (Germany-scale, eventually) reads as broken when compared at equal column
                width, but not when each is just its own list, the same way /communities or
                /venues already read as normal long lists. Each row is a plain table-style line
                (name / city / link) rather than a bordered card — a dense country's teacher list
                is meant to scan fast, not to be browsed tile by tile. ExpandableList caps the
                initial render and expands in place, deliberately not linking out to a "view all"
                page since /teachers isn't a real filterable directory yet (I-132 shipped ahead
                of it). */}
            {communities.length > 0 && (
              <section className="mb-8">
                <h2 className="mb-3 font-serif text-xl text-slate-900">Communities</h2>
                <div className="divide-y divide-(--color-sand-strong) overflow-hidden rounded-xl border border-(--color-sand-strong) bg-white">
                  <ExpandableList
                    itemLabel="communities"
                    initialCount={7}
                    items={communities.map((c) => (
                      <CompactCommunityRow key={c.id} community={c} />
                    ))}
                  />
                </div>
                <p className="mt-3 text-sm text-slate-500">
                  Know a community in {labelWithArticle} we&apos;re missing?{" "}
                  <a href={COMMUNITY_SUBMIT_URL} target="_blank" rel="noopener noreferrer" className="font-medium text-(--color-pine) hover:underline">
                    Suggest it →
                  </a>
                </p>
              </section>
            )}
          </div>
        )}

        {teachers.length > 0 && (
          <section id="teachers" className="mb-8 scroll-mt-6">
            <h2 className="mb-3 font-serif text-xl text-slate-900">Teachers</h2>
            <div className="divide-y divide-(--color-sand-strong) overflow-hidden rounded-xl border border-(--color-sand-strong) bg-white">
              <ExpandableList
                itemLabel="teachers"
                initialCount={7}
                items={teachers.map((t) => (
                  <CompactTeacherRow key={t.id} teacher={t} />
                ))}
              />
            </div>
            <p className="mt-3 text-sm text-slate-500">
              Know a teacher, organizer, or musician who should be listed?{" "}
              <Link href="/auth" className="font-medium text-(--color-pine) hover:underline">
                Create your profile →
              </Link>
            </p>
          </section>
        )}

        {events.length > 0 && (
          <section id="events" className="mb-8 scroll-mt-6">
            <h2 className="mb-3 font-serif text-xl text-slate-900">Upcoming events</h2>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {events.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
            <p className="mt-3 text-sm text-slate-500">
              Missing your event in {labelWithArticle}?{" "}
              <Link href="/events/new" className="font-medium text-(--color-pine) hover:underline">
                Add it →
              </Link>
            </p>
          </section>
        )}

        {venues.length > 0 && (
          <section id="venues" className="mb-8 scroll-mt-6">
            <h2 className="mb-3 font-serif text-xl text-slate-900">Venues</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {venues.map((v) => (
                <VenueCard key={v.id} venue={v} />
              ))}
            </div>
            <p className="mt-3 text-sm text-slate-500">
              Know a venue in {labelWithArticle} that should be here?{" "}
              <a href="mailto:hello@citreasurehunt.com" className="font-medium text-(--color-pine) hover:underline">
                Let us know →
              </a>
            </p>
          </section>
        )}

        <div className="mt-4 grid grid-cols-1 gap-4 border-t border-(--color-sand-strong) pt-6 sm:grid-cols-2">
          {otherCountries.length > 0 && (
            <div className="rounded-xl border border-(--color-sand-strong) bg-white p-5">
              <h2 className="mb-3 font-serif text-lg text-slate-900">Explore other countries</h2>
              <div className="flex flex-wrap gap-2">
                {otherCountries.map((c) => (
                  <Link
                    key={c.iso}
                    href={`/${c.slug}`}
                    className="flex items-center gap-1.5 rounded-full border border-(--color-sand-strong) bg-(--color-sand) px-3.5 py-1.5 text-sm font-medium text-slate-800 transition hover:border-(--color-pine) hover:text-(--color-pine)"
                  >
                    <span>{getCountryFlag(c.iso)}</span>
                    {c.label}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Distinct from the per-section "missing X? tell us" lines above (Communities/
              Teachers/Events/Venues each already have their own) — this is a standing invitation
              to become the country's CI Ambassador (a volunteer role, established terminology —
              don't rename this again without checking), not another one-off correction prompt, so
              it gets its own card rather than blending into that stack. */}
          <div className={`rounded-xl border border-(--color-sand-strong) border-l-4 border-l-(--color-pine) bg-(--color-sand) p-5 ${otherCountries.length === 0 ? "sm:col-span-2" : ""}`}>
            <h2 className="mb-1.5 font-serif text-lg text-slate-900">Become a CI Ambassador for {labelWithArticle}</h2>
            <p className="mb-3 text-sm leading-6 text-slate-700">
              We&apos;re looking for someone connected to the CI scene in {labelWithArticle} to help keep this
              page accurate over time — new events, missing teachers or venues, corrections as the
              community grows.
            </p>
            <a
              href="mailto:hello@citreasurehunt.com"
              className="inline-block rounded-lg bg-(--color-pine) px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
            >
              Get in touch →
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}

// A real card, not a reused CompactCommunityRow — NATIONAL_COMMUNITY_SLUGS (lib/country-pages.ts)
// is deliberately curated to be small, realistically one entry per country, so this section is
// effectively always a single spotlight rather than a list. Reusing the dense table-row style
// left it looking *less* finished than the plain "Communities" list below it (no card, no
// description, nothing to say why it's separated out) — backwards for the one community meant to
// stand out. Surfaces `description` (unused by CompactCommunityRow) and a real button instead of
// a bare icon.
function NationalCommunitySpotlight({ community }: { community: Community }) {
  const joinUrl = getPrimaryJoinUrl(community);
  return (
    <div className="rounded-xl border border-(--color-sand-strong) border-l-4 border-l-(--color-pine) bg-(--color-sand) p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/communities/${community.slug}`} className="font-serif text-2xl text-slate-900 hover:underline">
            {community.name}
          </Link>
          {community.city && (
            <p className="mt-1 flex items-center gap-1 text-sm text-slate-500">
              <MapPin className="size-3.5 shrink-0 text-slate-400" />
              {community.city}
            </p>
          )}
        </div>
        {joinUrl && (
          <a
            href={joinUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 rounded-lg bg-(--color-pine) px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
          >
            Join →
          </a>
        )}
      </div>
      {community.description && <p className="mt-3 text-sm leading-6 text-slate-700">{community.description}</p>}
    </div>
  );
}

