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

export const revalidate = 3600;

export default function WorkshopsPage() {
  return <EventTypeListing config={config} />;
}
