import { notFound, permanentRedirect } from "next/navigation";

import { EventDetailView } from "@/components/event-detail-view";
import { getEventBySlug, parseEventSlug, stripMarkdown } from "@/lib/events";
import { buildEventFallbackDescription, getCountryLabel } from "@/lib/event-display";
import { getCountryPageLink } from "@/lib/country-pages";
import { SITE_URL, buildEntityTitle } from "@/lib/site";
import { ogImage, socialImageUrl } from "@/lib/og-image";

// I-172: 24h, not 1h. This route is invalidated on write by the Supabase revalidate webhook
// (app/api/revalidate/route.ts), so the timer is only a backstop, not the freshness mechanism.
// At 1h every crawler sweep regenerated it; crawlers outnumber human pageviews here by roughly
// an order of magnitude, and that regeneration is what consumed the ISR Write quota.
// I-175 step 5 (2026-11-07): 7 days. The date-driven states now have nightly jobs behind them
// (archive-past-events sets ended events to archived, revalidate-started-class-series refreshes a
// class series once it has started), so the timer only catches a missed invalidation.
export const revalidate = 604800;

// I-175 step 4: cached per URL on first request, instead of rendered on every request (which was
// ~2,800 renders a day in Nov 2026, the largest share of Vercel CPU and Supabase egress). Safe
// because nothing here reads cookies or the user: getEventBySlug is the signed-out view, cached
// per event and tagged event:<shortId>. The webhook refreshes this page when the event, its
// credits, venue, organizing communities or series siblings change. One date-dependent state has
// no write behind it: a class series' "booking closed" once its first session has passed. The
// pg_cron job revalidate-started-class-series (00:10 UTC) refreshes those pages.
export const dynamic = "force-static";

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
      images: [socialImageUrl(event.imageUrl)],
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
