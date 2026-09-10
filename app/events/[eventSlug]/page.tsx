import { notFound, permanentRedirect } from "next/navigation";

import { EventDetailView } from "@/components/event-detail-view";
import { getEventBySlug, parseEventSlug, stripMarkdown } from "@/lib/events";
import { buildEventFallbackDescription, getCountryLabel } from "@/lib/event-display";
import { getCountryPageLink } from "@/lib/country-pages";
import { SITE_URL, SITE_OG_IMAGE, buildEntityTitle } from "@/lib/site";
import { ogImage } from "@/lib/og-image";

// I-172: 24h, not 1h. This route is invalidated on write by the Supabase revalidate webhook
// (app/api/revalidate/route.ts), so the timer is only a backstop, not the freshness mechanism.
// At 1h every crawler sweep regenerated it; crawlers outnumber human pageviews here by roughly
// an order of magnitude, and that regeneration is what consumed the ISR Write quota.
export const revalidate = 86400;

type EventPageProps = {
  params: Promise<{
    eventSlug: string;
  }>;
};

export async function generateMetadata({ params }: { params: Promise<{ eventSlug: string }> }) {
  const { eventSlug } = await params;
  const parsed = parseEventSlug(eventSlug);
  if (!parsed) return {};
  const event = await getEventBySlug(parsed.shortId);
  if (!event) return {};
  const description = event.description
    ? stripMarkdown(event.description).slice(0, 160)
    : buildEventFallbackDescription(event.type, event.city, getCountryLabel(event.country));
  return {
    title: buildEntityTitle(event.title),
    description,
    alternates: {
      canonical: `${SITE_URL}/events/${event.slug}`,
    },
    openGraph: {
      title: event.title,
      description,
      url: `${SITE_URL}/events/${event.slug}`,
      siteName: "CI Treasure Hunt",
      type: "article",
      images: [await ogImage(event.imageUrl)],
    },
    twitter: {
      card: "summary_large_image",
      title: event.title,
      description,
      images: [event.imageUrl ?? SITE_OG_IMAGE],
    },
  };
}

export default async function EventPage({ params }: EventPageProps) {
  const { eventSlug } = await params;
  const parsed = parseEventSlug(eventSlug);

  if (!parsed) {
    notFound();
  }

  const event = await getEventBySlug(parsed.shortId);
  if (!event) {
    notFound();
  }

  if (eventSlug !== event.slug) {
    permanentRedirect(`/events/${event.slug}`);
  }

  const countryLink = await getCountryPageLink(event.country);

  return <EventDetailView event={event} countryLink={countryLink} />;
}
