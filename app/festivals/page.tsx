import { Metadata } from "next";

import { EventTypeListing } from "@/components/event-type-listing";
import { getEventTypePageConfig } from "@/lib/event-type-pages";
import { SITE_URL, SITE_OG_IMAGE } from "@/lib/site";

const config = getEventTypePageConfig("festival");
const TITLE = `${config.label} Worldwide`;

export const metadata: Metadata = {
  title: TITLE,
  description: config.description,
  // Filters on the homepage calendar live in the URL via client-side history navigation, not
  // real links, and are excluded from indexing for that reason (see app/page.tsx) — this page
  // exists specifically to be the crawlable, canonical answer for this type. Same reasoning as
  // /venues and /communities.
  alternates: { canonical: `${SITE_URL}${config.path}` },
  // Explicit block required: Next doesn't deep-merge nested metadata keys, so without this the
  // page would inherit the root layout's openGraph wholesale (title "CI Treasure Hunt", url
  // pointing at the homepage) — same bug documented on /venues and /communities.
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

export const revalidate = 3600;

export default function FestivalsPage() {
  return <EventTypeListing config={config} />;
}
