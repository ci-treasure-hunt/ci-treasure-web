import type { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";
import { SITE_URL } from "@/lib/site";
import { getAllCountrySummaries } from "@/lib/country-pages";

export const revalidate = 3600;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = (supabaseUrl && supabaseKey)
  ? createClient(supabaseUrl, supabaseKey)
  : null;

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
      { url: `${SITE_URL}/newsletter`, changeFrequency: "monthly", priority: 0.4 },
      { url: `${SITE_URL}/feedback`, changeFrequency: "monthly", priority: 0.3 },
    ];
  }

  const [{ data: events }, { data: venues }, { data: profiles }, { data: communities }, countrySummaries] =
    await Promise.all([
      supabase
        .from("events")
        .select("short_id, title, updated_at")
        .eq("status", "published")
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
        .select("slug, airtable_updated_at")
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
    { url: `${SITE_URL}/newsletter`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${SITE_URL}/feedback`, changeFrequency: "monthly", priority: 0.3 },
  ];

  const eventUrls: MetadataRoute.Sitemap = (events ?? []).map((e) => ({
    url: `${SITE_URL}/events/${e.short_id}-${slugify(e.title)}`,
    lastModified: new Date(e.updated_at),
    changeFrequency: "weekly",
    priority: 0.8,
  }));

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
      // airtable_updated_at, not synced_at — the daily sync touches every row's
      // synced_at whether or not content changed, which would fake "modified today"
      // for all 257 communities every run.
      lastModified: c.airtable_updated_at ? new Date(c.airtable_updated_at) : undefined,
      changeFrequency: "weekly",
      priority: 0.6,
    }));

  const countryUrls: MetadataRoute.Sitemap = countrySummaries.map((c) => ({
    url: `${SITE_URL}/${c.slug}`,
    lastModified: new Date(c.updatedAt),
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  return [...staticPages, ...eventUrls, ...venueUrls, ...teacherUrls, ...communityUrls, ...countryUrls];
}
