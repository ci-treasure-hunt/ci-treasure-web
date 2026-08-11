import { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import {
  ExternalLink,
  Facebook,
  Globe,
  Instagram,
  MapPin,
  MessageSquare,
  Youtube,
} from "lucide-react";

import BackButton from "@/components/back-button";
import { EntityBreadcrumb } from "@/components/entity-breadcrumb";
import VenueMap from "@/components/venue-map";
import { SocialLink } from "@/components/social-link";
import { RevealEmail } from "@/components/reveal-email";
import { EntityEventCard } from "@/components/entity-event-card";
import { EntityImage } from "@/components/entity-image";
import { CommunitySpotlightCard } from "@/components/entity-cards";
import { CompactTeacherRow } from "@/components/compact-entity-row";
import { getLinkLabel, linkSortKey } from "@/lib/events";
import { GENERIC_ACCENT_GRADIENT, getCountryLabel, padShortDescription } from "@/lib/event-display";
import { getAllVenueSlugs, getVenueBySlug, getVenueEvents, getVenueAssociations, resolveVenueSlugRedirect, getVenueRingNeighbors } from "@/lib/venues";
import { getCountryPageLink } from "@/lib/country-pages";
import { getCountryFlag } from "@/lib/utils";
import { SITE_URL, SITE_OG_IMAGE, buildEntityTitle } from "@/lib/site";
import { ogImage } from "@/lib/og-image";
import { ReportButton } from "@/components/report-button";
import { AlsoBrowse } from "@/components/also-browse";

export const revalidate = 3600;

type VenuePageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export async function generateStaticParams() {
  const slugs = await getAllVenueSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: VenuePageProps): Promise<Metadata> {
  const { slug } = await params;
  const venue = await getVenueBySlug(slug);
  if (!venue) return {};

  const countryLabel = getCountryLabel(venue.country);
  const description = venue.description
    ? padShortDescription(venue.description, "venues")
    : `${venue.name} is a Contact Improvisation venue in ${venue.city}, ${countryLabel}, part of the CI Treasure Hunt directory of spaces hosting jams, workshops, and festivals.`.slice(0, 160);
  return {
    title: buildEntityTitle(venue.name, { city: venue.city, country: countryLabel }),
    description,
    alternates: {
      canonical: `${SITE_URL}/venues/${venue.slug}`,
    },
    openGraph: {
      title: venue.name,
      description,
      url: `${SITE_URL}/venues/${venue.slug}`,
      siteName: "CI Treasure Hunt",
      type: "website",
      images: [await ogImage(venue.imageUrl)],
    },
    twitter: {
      card: "summary_large_image",
      title: venue.name,
      description,
      images: [venue.imageUrl ?? SITE_OG_IMAGE],
    },
  };
}

export default async function VenuePage({ params }: VenuePageProps) {
  const { slug } = await params;
  const venue = await getVenueBySlug(slug);

  if (!venue) {
    const currentSlug = await resolveVenueSlugRedirect(slug);
    if (currentSlug) {
      permanentRedirect(`/venues/${currentSlug}`);
    }
    notFound();
  }

  const [{ upcoming, past }, countryLink, associations, ringNeighbors] = await Promise.all([
    getVenueEvents(venue.id),
    getCountryPageLink(venue.country),
    getVenueAssociations(venue.id),
    getVenueRingNeighbors(venue.slug, venue.country),
  ]);

  const ensureHttps = (url: string) => url.startsWith("http") ? url : `https://${url}`;
  type LinkRow = { type: string; href: string; label: string; icon: React.ReactNode };
  const venueLinks: LinkRow[] = [];
  if (venue.website) venueLinks.push({ type: "website", href: ensureHttps(venue.website), label: getLinkLabel("website"), icon: <Globe className="h-4 w-4" /> });
  if (venue.facebook) venueLinks.push({ type: "facebook", href: ensureHttps(venue.facebook), label: getLinkLabel("facebook"), icon: <Facebook className="h-4 w-4" /> });
  if (venue.instagram) venueLinks.push({ type: "instagram", href: ensureHttps(venue.instagram), label: getLinkLabel("instagram"), icon: <Instagram className="h-4 w-4" /> });
  if (venue.youtube) venueLinks.push({ type: "youtube", href: ensureHttps(venue.youtube), label: getLinkLabel("youtube"), icon: <Youtube className="h-4 w-4" /> });
  if (venue.newsletter) venueLinks.push({ type: "newsletter", href: ensureHttps(venue.newsletter), label: getLinkLabel("newsletter"), icon: <MessageSquare className="h-4 w-4" /> });
  for (const link of venue.links?.items ?? []) {
    venueLinks.push({ type: link.type, href: ensureHttps(link.url), label: getLinkLabel(link.type, link.label), icon: <ExternalLink className="h-4 w-4" /> });
  }
  venueLinks.sort((a, b) => linkSortKey(a.type) - linkSortKey(b.type));

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Place",
    name: venue.name,
    image: venue.imageUrl ?? undefined,
    description: venue.description ?? undefined,
    url: `${SITE_URL}/venues/${venue.slug}`,
    address: {
      "@type": "PostalAddress",
      streetAddress: venue.address ?? undefined,
      addressLocality: venue.city,
      addressCountry: venue.country,
    },
    geo:
      venue.lat && venue.lng
        ? { "@type": "GeoCoordinates", latitude: venue.lat, longitude: venue.lng }
        : undefined,
  };

  return (
    <main className="min-h-screen bg-(--color-mist) px-5 py-8 text-slate-900 sm:px-8 lg:px-10">
      <script
        type="application/ld+json"
        // venue.description/name are organizer/curator-controlled free text — escape "<"
        // so a value containing "</script>" can't break out of this tag (same pattern
        // as the event page's JSON-LD).
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <EntityBreadcrumb
          country={countryLink}
          currentLabel={venue.name}
          currentUrl={`${SITE_URL}/venues/${venue.slug}`}
        />
        <div className="flex flex-wrap items-center gap-3">
          <BackButton />
        </div>

        <section className="overflow-hidden rounded-[2rem] border border-white/80 bg-white shadow-[0_25px_90px_rgba(105,73,22,0.12)]">
          <div className={`flex min-h-52 flex-col justify-end border-b border-(--color-sand-strong) ${GENERIC_ACCENT_GRADIENT} px-6 py-8 sm:px-8`}>
            <div className="max-w-3xl space-y-3">
              <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-white/90">
                <span className="leading-none" title={getCountryLabel(venue.country)}>{getCountryFlag(venue.country)}</span>
                <span>
                  {venue.city}, {getCountryLabel(venue.country)}
                  {venue.region && venue.region !== venue.city ? ` · ${venue.region}` : ""}
                </span>
              </p>
              <h1 className="font-serif text-4xl leading-tight tracking-tight text-white sm:text-5xl">
                {venue.name}
              </h1>
              <p className={`flex items-start gap-2 text-white/90 ${venue.address ? "" : "invisible"}`}>
                <MapPin className="mt-1 h-4 w-4 shrink-0 text-white/70" />
                <span>{venue.address}</span>
              </p>
            </div>
          </div>

          <div className="grid gap-8 px-6 py-8 sm:px-8 lg:grid-cols-[1.4fr_0.8fr]">
            <div className="space-y-10">
              {venue.imageUrl && (
                <EntityImage src={venue.imageUrl} alt={venue.name} credit={venue.imageCredit} />
              )}

              {venue.description && (
                <section className="space-y-4">
                  <h2 className="font-serif text-2xl text-slate-950">About the venue</h2>
                  <p className="whitespace-pre-line text-base leading-8 text-slate-700">
                    {venue.description}
                  </p>
                </section>
              )}

              {venue.lat && venue.lng && (
                <section className="space-y-4">
                  <h2 className="font-serif text-2xl text-slate-950">Location</h2>
                  <VenueMap lat={venue.lat} lng={venue.lng} name={venue.name} />
                </section>
              )}

              {associations.people.length > 0 && (
                <section className="space-y-3">
                  <h2 className="font-serif text-2xl text-slate-950">People</h2>
                  <div className="divide-y divide-(--color-sand-strong) overflow-hidden rounded-xl border border-(--color-sand-strong) bg-white">
                    {associations.people.map((p) => (
                      <CompactTeacherRow key={p.slug} teacher={p} />
                    ))}
                  </div>
                </section>
              )}

              <section className="space-y-6">
                <h2 className="font-serif text-2xl text-slate-950">Events at this venue</h2>

                <div className="space-y-8">
                  <div className="space-y-4">
                    <h3 className="text-sm font-bold uppercase tracking-widest text-slate-500">
                      Upcoming Events
                    </h3>
                    {upcoming.length > 0 ? (
                      <div className="grid gap-4">
                        {upcoming.map((event) => (
                          <EntityEventCard key={event.id} event={event} />
                        ))}
                      </div>
                    ) : (
                      <p className="italic text-slate-500">No upcoming events scheduled.</p>
                    )}
                  </div>

                  {past.length > 0 && (
                    <details className="group">
                      <summary className="cursor-pointer list-none space-y-4">
                        <div className="flex items-center justify-between border-t border-(--color-sand-strong) pt-6">
                          <h3 className="text-sm font-bold uppercase tracking-widest text-slate-500">
                            Past Events ({past.length})
                          </h3>
                          <span className="text-sm font-medium text-violet-600 group-open:hidden">
                            Show past events
                          </span>
                          <span className="hidden text-sm font-medium text-violet-600 group-open:block">
                            Hide past events
                          </span>
                        </div>
                      </summary>
                      <div className="mt-4 grid gap-4">
                        {past.map((event) => (
                          <EntityEventCard key={event.id} event={event} />
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              </section>

              {associations.communities.length > 0 && (
                <section className="space-y-3">
                  <h2 className="font-serif text-2xl text-slate-950">
                    {associations.communities.length > 1 ? "Associated Communities" : "Associated Community"}
                  </h2>
                  <div className="space-y-3">
                    {associations.communities.map((c) => (
                      <CommunitySpotlightCard key={c.slug} community={c} />
                    ))}
                  </div>
                </section>
              )}
            </div>

            <aside className="space-y-6">
              <section className="rounded-[1.75rem] border border-(--color-sand-strong) bg-(--color-mist) p-6">
                <h2 className="font-serif text-2xl text-slate-950">Links</h2>
                <div className="mt-5 flex flex-col gap-3">
                  {venueLinks.length > 0
                    ? venueLinks.map((row, i) => (
                        <SocialLink key={i} href={row.href} icon={row.icon} label={row.label} />
                      ))
                    : !venue.email && <p className="text-sm text-slate-500 italic">No links available.</p>
                  }
                  {venue.email && <RevealEmail entityType="venue" entityId={venue.id} />}
                </div>
              </section>
            </aside>
          </div>
        </section>
        <div className="text-center text-sm text-slate-400">
          <ReportButton
            entity_type="venue"
            entity_id={venue.id}
            entity_title={venue.name}
            entity_slug={venue.slug}
          />
        </div>
        <AlsoBrowse basePath="/venues" items={ringNeighbors} />
      </div>
    </main>
  );
}
