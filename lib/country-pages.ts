import { createClient as createStaticClient } from "@/lib/supabase/static";
import { getCountryLabel, type EventListItem } from "@/lib/event-display";
import { mapEventRow, slugify, type SupabaseEventRow } from "@/lib/events";
import { getCommunities, type Community } from "@/lib/communities";
import { safeExternalUrl } from "@/lib/url-safety";

function hasSupabaseEnv() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

// I-132: which community (if any) is a country's genuine *national* umbrella group — a judgment
// call requiring local knowledge, not something safely inferred from a data field. "Has a
// website" was the original heuristic; it broke for Greece both ways at once (missed "Contact
// Improvisation Greece", the real national FB group, since it has no website on file; would have
// wrongly promoted "Contact Improvisation Crete" purely because that regional group happens to
// have one). Deliberately not a `communities` table column either — that table is fully
// Airtable-synced (sync-communities.yml, daily), so a manual-only flag there would get silently
// ignored or overwritten by the next sync. Curated here by hand, once per country, at the same
// moment its summary gets written/reviewed.
const NATIONAL_COMMUNITY_SLUGS: Record<string, string[]> = {
  GR: ["contact-improvisation-greece"],
  PT: ["contact-improvisation-portugal"],
  // The contactimprov.es directory, run by Manu Paredes. Renamed from the placeholder "Overview
  // Spain" 2026-08-15; its slug was rewritten to match by hand, with the old one kept in
  // previous_slugs. sync_communities.py reads a row's existing slug back from Supabase and reuses
  // it, so the rename survives the next sync rather than reverting.
  ES: ["contact-improvisacion-espana"],
  // The national Facebook group (~1,300 members), the largest of the three Czech groups and the
  // only country-wide one; Prague and Brno have their own separate city groups. No website on
  // file, same shape as Greece above.
  CZ: ["contact-improvisation-czech-republic"],
};

export type CountrySummary = {
  iso: string;
  slug: string;
  label: string;
  summaryText: string;
  updatedAt: string;
};

export type CountryTeacher = {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  bio: string | null;
  imageUrl: string | null;
  linkUrl: string | null;
};

export type CountryVenue = {
  id: string;
  name: string;
  slug: string;
  city: string;
  description: string | null;
  imageUrl: string | null;
  lat: number | null;
  lng: number | null;
};

// Unified shape for the combined map — events/venues/communities are all place-like (you can
// go there, join it, attend it), unlike teachers, which is why the map stays a three-type
// layer and doesn't try to plot individual people. See docs/issues/i-132-country-pages.md for
// the reasoning on why teacher coordinates were deliberately not added.
export type CountryMapMarker = {
  id: string;
  type: "event" | "venue" | "community";
  title: string;
  href: string;
  lat: number;
  lng: number;
};

export type CountryPageData = {
  iso: string;
  slug: string;
  label: string;
  summaryText: string;
  summaryUpdatedAt: string;
  nationalCommunities: Community[];
  communities: Community[];
  teachers: CountryTeacher[];
  events: EventListItem[];
  venues: CountryVenue[];
  mapMarkers: CountryMapMarker[];
};

// Every country page requires a row here — this is the "minimum entity threshold before
// publishing" gate from the I-132 spec, enforced in practice: no reviewed summary, no static
// page. Reused for both generateStaticParams (which countries get pages) and slug resolution
// (which iso a given /[slug] request maps to).
// Exported for app/page.tsx's homepage "About" line — needs {label, slug} pairs for every live
// country page, not just the slugs generateStaticParams needs.
export async function getAllCountrySummaries(): Promise<CountrySummary[]> {
  if (!hasSupabaseEnv()) return [];
  const supabase = createStaticClient();
  const { data, error } = await supabase.from("country_summaries").select("iso, summary_text, updated_at");
  if (error || !data) return [];
  return data.map((row) => ({
    iso: row.iso,
    slug: slugify(getCountryLabel(row.iso)),
    label: getCountryLabel(row.iso),
    summaryText: row.summary_text,
    updatedAt: row.updated_at,
  }));
}

export async function getAllCountrySlugs(): Promise<string[]> {
  const summaries = await getAllCountrySummaries();
  return summaries.map((s) => s.slug);
}

// I-132 Step 2 (breadcrumbs): entity detail pages (events/venues/teachers/communities) use this
// to decide whether their breadcrumb trail gets a "Sweden" segment at all. Deliberately returns
// null rather than a country-less fallback — no country page for that iso means no breadcrumb
// segment, not a broken/empty one (see Breadcrumbs component).
export async function getCountryPageLink(iso: string | null): Promise<{ slug: string; label: string } | null> {
  if (!iso) return null;
  const summaries = await getAllCountrySummaries();
  const match = summaries.find((s) => s.iso === iso);
  return match ? { slug: match.slug, label: match.label } : null;
}

async function resolveCountryBySlug(slug: string): Promise<CountrySummary | null> {
  const summaries = await getAllCountrySummaries();
  return summaries.find((s) => s.slug === slug) ?? null;
}

export async function getCountryPageData(slug: string): Promise<CountryPageData | null> {
  if (!hasSupabaseEnv()) return null;

  const summary = await resolveCountryBySlug(slug);
  if (!summary) return null;

  const supabase = createStaticClient();
  const today = new Date().toISOString().split("T")[0];

  const EVENT_COLS =
    "id, short_id, title, description, type, start_date, end_date, city, country, image_url, lat, lng, discipline, cancelled";

  const [{ communities: allSiteCommunities }, { data: teacherRows }, { data: eventRows }, { data: venueRows }] =
    await Promise.all([
      // Reuses the same fully-normalized Community shape (and CommunityCard UI) as /communities,
      // instead of a stripped-down id/name/slug/city/website select — one fetch of all
      // communities, filtered in-memory by country below, rather than a duplicate query.
      getCommunities(),
      supabase
        .from("profiles")
        .select("id, name, slug, city, bio, image_url, image_status, website, instagram, facebook")
        .eq("country", summary.iso)
        .eq("visibility", "public")
        .eq("is_teacher", true)
        .order("name"),
      supabase
        .from("events")
        .select(EVENT_COLS)
        .eq("country", summary.iso)
        .eq("status", "published")
        .gte("end_date", today)
        .order("start_date", { ascending: true }),
      supabase
        .from("venues")
        .select("id, name, slug, city, description, image_url, lat, lng")
        .eq("country", summary.iso)
        .eq("visibility", "public")
        // Matches lib/venues.ts's getVenues() curation gate — without it this query pulled in
        // venues that are public but deliberately excluded from the curated /venues list
        // (show_in_list=false), which is how un-enriched, image-less venues were leaking onto
        // the country page.
        .eq("show_in_list", true)
        .order("name"),
    ]);

  const allCommunities = allSiteCommunities.filter((c) => c.countryIso === summary.iso);

  // National community spotlight, shown separately above the general list — see I-132 spec's
  // "Canada/Switzerland/Dutch communities have their own site" case. Curated via
  // NATIONAL_COMMUNITY_SLUGS above, not inferred. Not always populated (e.g. Sweden has no
  // override entry), in which case this section is simply omitted by the page.
  const nationalSlugs = NATIONAL_COMMUNITY_SLUGS[summary.iso] ?? [];
  const nationalCommunities = allCommunities.filter((c) => nationalSlugs.includes(c.slug));
  const communities = allCommunities.filter((c) => !nationalSlugs.includes(c.slug));

  const teachers = (teacherRows ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    slug: t.slug,
    city: t.city,
    bio: t.bio,
    // Gate on image_status, not just presence: a photo stays pending until reviewed, and the
    // privacy policy (section 7) states plainly that it is not publicly visible until then.
    // No live impact today (1 approved photo across the whole directory) but this breaks that
    // promise the moment claims start bringing photos in.
    imageUrl: t.image_status === "approved" ? t.image_url : null,
    // Table row's "links" column — website preferred, social as fallback. Sparse today (only a
    // few of Sweden's 13 teachers have one on file) but graceful when absent, same as
    // getPrimaryJoinUrl() for communities.
    linkUrl: safeExternalUrl(t.website ?? t.instagram ?? t.facebook),
  }));

  const events = ((eventRows ?? []) as SupabaseEventRow[]).map(mapEventRow);

  const venues = (venueRows ?? []).map((v) => ({
    id: v.id,
    name: v.name,
    slug: v.slug,
    city: v.city,
    description: v.description,
    imageUrl: v.image_url,
    lat: v.lat,
    lng: v.lng,
  }));

  const mapMarkers: CountryMapMarker[] = [
    ...events
      .filter((e): e is typeof e & { lat: number; lng: number } => typeof e.lat === "number" && typeof e.lng === "number")
      .map((e) => ({ id: e.id, type: "event" as const, title: e.title, href: `/events/${e.slug}`, lat: e.lat, lng: e.lng })),
    ...venues
      .filter((v): v is typeof v & { lat: number; lng: number } => typeof v.lat === "number" && typeof v.lng === "number")
      .map((v) => ({ id: v.id, type: "venue" as const, title: v.name, href: `/venues/${v.slug}`, lat: v.lat, lng: v.lng })),
    ...allCommunities
      .filter((c): c is typeof c & { latitude: number; longitude: number } => typeof c.latitude === "number" && typeof c.longitude === "number")
      .map((c) => ({ id: c.id, type: "community" as const, title: c.name, href: `/communities/${c.slug}`, lat: c.latitude, lng: c.longitude })),
  ];

  return {
    iso: summary.iso,
    slug: summary.slug,
    label: summary.label,
    summaryText: summary.summaryText,
    summaryUpdatedAt: summary.updatedAt,
    nationalCommunities,
    communities,
    teachers,
    events,
    venues,
    mapMarkers,
  };
}
