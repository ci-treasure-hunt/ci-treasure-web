import type { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";
import { SITE_URL } from "@/lib/site";
import { getAllCountrySummaries } from "@/lib/country-pages";
import { EVENT_TYPE_PAGES } from "@/lib/event-type-pages";
import { getAllGuides } from "@/lib/guides";

// I-172: 24h. This enumerates every event, teacher, venue, community and country URL, so it is
// one of the most expensive things on the site to regenerate, and crawlers refetch it often.
export const revalidate = 86400;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = (supabaseUrl && supabaseKey)
  ? createClient(supabaseUrl, supabaseKey)
  : null;

// Deliberately a local copy of lib/events.ts's slugify() rather than an import. That module
// pulls in the cookie-aware Supabase server client at module scope, and importing it here risks
// flipping this route from ISR to dynamic — the exact regression I-172 was about, and expensive
// on a route that enumerates every event, teacher, venue and community URL.
//
// The two MUST stay byte-identical: this builds the event URLs, lib/events.ts's buildEventSlug()
// builds the ones the site actually links to and the revalidate webhook busts. If they drift,
// every event URL in the sitemap 404s while the real pages stay fine, which is close to invisible
// in testing. Verified identical 2026-09-21.
const SLUG_CHAR_MAP: Record<string, string> = {
  ł: "l", ø: "o", ß: "ss", đ: "d", ð: "d", þ: "th", æ: "ae", å: "a",
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[łøßđðþæå]/g, (c) => SLUG_CHAR_MAP[c] ?? c)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!supabase) {
    return [
      { url: SITE_URL, changeFrequency: "daily", priority: 1.0 },
      { url: `${SITE_URL}/communities`, changeFrequency: "weekly", priority: 0.7 },
      { url: `${SITE_URL}/venues`, changeFrequency: "weekly", priority: 0.7 },
      { url: `${SITE_URL}/teachers`, changeFrequency: "weekly", priority: 0.7 },
      { url: `${SITE_URL}/countries`, changeFrequency: "weekly", priority: 0.7 },
      ...EVENT_TYPE_PAGES.map((t) => ({ url: `${SITE_URL}${t.path}`, changeFrequency: "weekly" as const, priority: 0.7 })),
      { url: `${SITE_URL}/guides`, changeFrequency: "weekly", priority: 0.7 },
      { url: `${SITE_URL}/about`, changeFrequency: "monthly", priority: 0.5 },
      { url: `${SITE_URL}/faq`, changeFrequency: "monthly", priority: 0.5 },
      { url: `${SITE_URL}/newsletter`, changeFrequency: "monthly", priority: 0.4 },
      { url: `${SITE_URL}/feedback`, changeFrequency: "monthly", priority: 0.3 },
    ];
  }

  const [{ data: events }, { data: venues }, { data: profiles }, { data: communities }, countrySummaries] =
    await Promise.all([
      // Archived included, not just published (fixed 2026-09-21). An archived event with
      // hide=false still serves a live, fully indexable page — events_select_public grants
      // public reads for published AND archived, and app/events/[eventSlug]/page.tsx sets no
      // noindex — so filtering to published here left 230 crawlable pages out of the sitemap.
      // Ahrefs found 193 of them ("Indexable page not in sitemap"), the ones still linked from
      // teacher, venue and country pages.
      //
      // Counter-intuitively this should REDUCE crawl load rather than add to it (I-172): Google
      // already crawls these pages, and a stable lastModified on a page that no longer changes
      // is the strongest available signal to stop re-crawling it. Listing them also keeps the
      // rankings past editions have accumulated, which real queries land on.
      supabase
        .from("events")
        .select("short_id, title, updated_at, status")
        .in("status", ["published", "archived"])
        .eq("hide", false),
      supabase
        .from("venues")
        .select("slug, updated_at")
        .eq("visibility", "public"),
      supabase
        .from("profiles")
        .select("slug, updated_at")
        .eq("visibility", "public"),
      supabase
        .from("communities")
        .select("slug, updated_at")
        .is("deleted_at", null),
      // I-132 Step 2: a country only shows up here once it has a reviewed row in
      // country_summaries — same gate getCountryPageData() itself enforces, so a country never
      // appears in the sitemap before it has a real page to match.
      getAllCountrySummaries(),
    ]);

  const staticPages: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: "daily", priority: 1.0 },
    { url: `${SITE_URL}/communities`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE_URL}/venues`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE_URL}/teachers`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE_URL}/countries`, changeFrequency: "weekly", priority: 0.7 },
    ...EVENT_TYPE_PAGES.map((t) => ({ url: `${SITE_URL}${t.path}`, changeFrequency: "weekly" as const, priority: 0.7 })),
    { url: `${SITE_URL}/guides`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE_URL}/about`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/faq`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/newsletter`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${SITE_URL}/feedback`, changeFrequency: "monthly", priority: 0.3 },
  ];

  const eventUrls: MetadataRoute.Sitemap = (events ?? []).map((e) => {
    const isArchived = e.status === "archived";
    return {
      url: `${SITE_URL}/events/${e.short_id}-${slugify(e.title)}`,
      lastModified: new Date(e.updated_at),
      // A past event's page is finished: nothing about it will change again, so say so rather
      // than inviting a weekly recrawl of what is now the larger half of the sitemap.
      changeFrequency: isArchived ? ("yearly" as const) : ("weekly" as const),
      priority: isArchived ? 0.3 : 0.8,
    };
  });

  const venueUrls: MetadataRoute.Sitemap = (venues ?? [])
    .filter((v) => v.slug)
    .map((v) => ({
      url: `${SITE_URL}/venues/${v.slug}`,
      lastModified: v.updated_at ? new Date(v.updated_at) : undefined,
      changeFrequency: "monthly",
      priority: 0.5,
    }));

  const teacherUrls: MetadataRoute.Sitemap = (profiles ?? [])
    .filter((p) => p.slug)
    .map((p) => ({
      url: `${SITE_URL}/teachers/${p.slug}`,
      lastModified: p.updated_at ? new Date(p.updated_at) : undefined,
      changeFrequency: "monthly",
      priority: 0.5,
    }));

  const communityUrls: MetadataRoute.Sitemap = (communities ?? [])
    .filter((c) => c.slug)
    .map((c) => ({
      url: `${SITE_URL}/communities/${c.slug}`,
      // I-111: updated_at, bumped by trigger on every edit. Only real edits touch the row
      // since the daily Airtable sync was retired; before that it was airtable_updated_at.
      lastModified: c.updated_at ? new Date(c.updated_at) : undefined,
      changeFrequency: "weekly",
      priority: 0.6,
    }));

  // I-148. Read off disk rather than from a query, so a guide is in the sitemap the moment its
  // markdown file is deployed. lastModified comes from each file's own `updated` frontmatter,
  // which is the only date that tracks the prose rather than the deploy.
  const guides = await getAllGuides();
  const guideUrls: MetadataRoute.Sitemap = guides.map((g) => ({
    url: `${SITE_URL}/guides/${g.frontmatter.slug}`,
    lastModified: g.frontmatter.updated ? new Date(`${g.frontmatter.updated}T00:00:00Z`) : undefined,
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  const countryUrls: MetadataRoute.Sitemap = countrySummaries.map((c) => ({
    url: `${SITE_URL}/${c.slug}`,
    lastModified: new Date(c.updatedAt),
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  return [...staticPages, ...eventUrls, ...venueUrls, ...teacherUrls, ...communityUrls, ...countryUrls, ...guideUrls];
}
