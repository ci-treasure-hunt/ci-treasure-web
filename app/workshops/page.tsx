import { Metadata } from "next";

import { EventTypeListing } from "@/components/event-type-listing";
import { getEventTypePageConfig } from "@/lib/event-type-pages";
import { SITE_URL, SITE_OG_IMAGE } from "@/lib/site";

const config = getEventTypePageConfig("workshop");
const TITLE = `${config.label} Worldwide`;

export const metadata: Metadata = {
  title: TITLE,
  description: config.description,
  alternates: { canonical: `${SITE_URL}${config.path}` },
  openGraph: {
    title: TITLE,
    description: config.description,
    url: `${SITE_URL}${config.path}`,
    siteName: "CI Treasure Hunt",
    type: "website",
    images: [{ url: SITE_OG_IMAGE, width: 1280, height: 1024, type: "image/jpeg" }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: config.description,
    images: [SITE_OG_IMAGE],
  },
};

// I-172: 24h, not 1h. This route is invalidated on write by the Supabase revalidate webhook
// (app/api/revalidate/route.ts), so the timer is only a backstop, not the freshness mechanism.
// At 1h every crawler sweep regenerated it; crawlers outnumber human pageviews here by roughly
// an order of magnitude, and that regeneration is what consumed the ISR Write quota.
export const revalidate = 86400;

export default function WorkshopsPage() {
  return <EventTypeListing config={config} />;
}
