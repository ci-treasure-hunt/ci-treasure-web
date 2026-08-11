import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { createClient as createStaticClient } from "@/lib/supabase/static";
import { mapEventRow, type SupabaseEventRow } from "./events";
import { getContinent, getContinentCountries } from "./entity-continents";
import { buildRing, RING_MIN_POOL, type RingEntity } from "./entity-ring";

export type InvitePlatform = "telegram" | "whatsapp" | "signal" | "line";

// Which invite platforms are ALLOW-LISTED (published) for a community. community_invites
// is service-role-only, so this uses the admin client. Only published rows are returned,
// so the pre-captcha UI never advertises a link that won't be revealed.
export async function getPublishedInvitePlatforms(
  communityId: string,
): Promise<Partial<Record<InvitePlatform, boolean>>> {
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("community_invites")
      .select("platform")
      .eq("community_id", communityId)
      .eq("published", true);
    const result: Partial<Record<InvitePlatform, boolean>> = {};
    for (const row of data ?? []) {
      const platform = row.platform as string;
      if (platform === "telegram" || platform === "whatsapp" || platform === "signal" || platform === "line") {
        result[platform] = true;
      }
    }
    return result;
  } catch {
    return {};
  }
}

// Public submit/issue forms still live on Airtable until I-039 Step 2
export const COMMUNITY_SUBMIT_URL =
  "https://airtable.com/appQWr8oE2rc2URpU/pagqLIrZE1eCTbvqn/form";
export const COMMUNITY_ISSUE_URL =
  "https://airtable.com/appQWr8oE2rc2URpU/pagUNLXJ4aG1oRDJ3/form";

type CommunityRow = {
  id: string;
  name: string;
  slug: string;
  type: string | null;
  city: string | null;
  country: string | null; // ISO 3166-1 alpha-2
  continent: string | null;
  address_for_map: string | null;
  lat: number | null;
  lng: number | null;
  description: string | null;
  website: string | null;
  instagram: string | null;
  facebook_group: string | null;
  facebook_page: string | null;
  telegram_group: string | null;
  telegram_channel: string | null;
  whatsapp_channel: string | null;
  youtube: string | null;
  calendar: string | null;
  newsletter: string | null;
  other_resource: string | null;
  has_invites: boolean;
  has_telegram_invite: boolean;
  has_whatsapp_invite: boolean;
  has_signal_invite: boolean;
  has_line_invite: boolean;
};

export type Community = {
  id: string;
  name: string;
  slug: string;
  type: string | null;
  city: string;
  country: string; // display label, e.g. "Germany"
  countryIso: string | null; // ISO 3166-1 alpha-2, e.g. "DE" — null for "Worldwide / several"
  description: string | null;
  websiteUrl: string | null;
  facebookGroupUrl: string | null;
  facebookPageUrl: string | null;
  instagramUrl: string | null;
  telegramGroupUrl: string | null;
  telegramChannelUrl: string | null;
  whatsappChannelUrl: string | null;
  youtubeUrl: string | null;
  calendarUrl: string | null;
  newsletterUrl: string | null;
  otherResourceUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  hasInvites: boolean;
  hasTelegramInvite: boolean;
  hasWhatsappInvite: boolean;
  hasSignalInvite: boolean;
  hasLineInvite: boolean;
};

export type CommunitiesResponse = {
  communities: Community[];
  countries: Array<{ value: string; label: string }>;
  communityCount: number;
  countryCount: number;
  error: string | null;
};

export type CommunityDetail = {
  id: string;
  name: string;
  slug: string;
  type: string | null;
  verified: boolean;
  city: string | null;
  country: string | null;
  region: string | null;
  continent: string | null;
  lat: number | null;
  lng: number | null;
  description: string | null;
  focus: string[] | null;
  activity_level: string | null;
  languages: string[] | null;
  audience_size: number | null;
  friendliness: string | null;
  contact_person: string | null;
  website: string | null;
  instagram: string | null;
  facebook_group: string | null;
  facebook_page: string | null;
  telegram_group: string | null;
  telegram_channel: string | null;
  whatsapp_channel: string | null;
  youtube: string | null;
  calendar: string | null;
  newsletter: string | null;
  other_resource: string | null;
  has_invites: boolean;
  has_telegram_invite: boolean;
  has_whatsapp_invite: boolean;
  has_signal_invite: boolean;
  has_line_invite: boolean;
  associatedVenues: { slug: string; name: string; city: string | null; description: string | null; imageUrl: string | null }[];
  associatedPeople: { id: string; name: string; slug: string; city: string | null; bio: string | null; imageUrl: string | null; linkUrl: string | null }[];
};

const countryNames = new Intl.DisplayNames(["en"], { type: "region" });

function countryLabel(row: CommunityRow): string {
  if (row.country) {
    try {
      return countryNames.of(row.country) ?? row.country;
    } catch {
      return row.country;
    }
  }
  // No ISO code (e.g. "Worldwide / several") — fall back to the address tail
  const tail = row.address_for_map?.split(",").map((p) => p.trim()).filter(Boolean).at(-1);
  return tail ?? "Worldwide / International";
}

function normalizeUrl(value: string | null): string | null {
  if (!value) return null;
  const str = value.trim();
  if (!str) return null;
  if (/^https?:\/\//i.test(str)) return str;
  if (/^mailto:/i.test(str)) return str;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str)) return `mailto:${str}`;
  // Free text (e.g. Calendar notes) — not renderable as a link
  if (/\s/.test(str) || !str.includes(".")) return null;
  return `https://${str}`;
}

function toCommunity(row: CommunityRow): Community {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    type: row.type,
    city: row.city ?? "",
    country: countryLabel(row),
    countryIso: row.country,
    description: row.description,
    websiteUrl: normalizeUrl(row.website),
    facebookGroupUrl: normalizeUrl(row.facebook_group),
    facebookPageUrl: normalizeUrl(row.facebook_page),
    instagramUrl: normalizeUrl(row.instagram),
    telegramGroupUrl: normalizeUrl(row.telegram_group),
    telegramChannelUrl: normalizeUrl(row.telegram_channel),
    whatsappChannelUrl: normalizeUrl(row.whatsapp_channel),
    youtubeUrl: normalizeUrl(row.youtube),
    calendarUrl: normalizeUrl(row.calendar),
    newsletterUrl: normalizeUrl(row.newsletter),
    otherResourceUrl: normalizeUrl(row.other_resource),
    latitude: row.lat,
    longitude: row.lng,
    hasInvites: row.has_invites,
    hasTelegramInvite: row.has_telegram_invite,
    hasWhatsappInvite: row.has_whatsapp_invite,
    hasSignalInvite: row.has_signal_invite,
    hasLineInvite: row.has_line_invite,
  };
}

// "Other Resource" is a catch-all field; detect Messenger/LINE links so they get
// the right icon/label instead of a generic "Other Resource" everywhere they're used.
export function isMessengerUrl(url: string | null): boolean {
  if (!url) return false;
  return /^https?:\/\/(www\.)?(messenger\.com|m\.me)\//i.test(url);
}

export function isLineUrl(url: string | null): boolean {
  if (!url) return false;
  return /^https?:\/\/(www\.)?line\.me\//i.test(url);
}

export function isPrivateGroupInvite(url: string | null): boolean {
  if (!url) return false;
  return (
    /^https?:\/\/chat\.whatsapp\.com\//i.test(url) ||
    /^https?:\/\/t\.me\/(\+|joinchat\/)/i.test(url) ||
    /^https?:\/\/signal\.group\//i.test(url)
  );
}

export function hasPrivateGroupLink(community: Community): boolean {
  return community.hasInvites;
}

export function getPrimaryJoinUrl(community: Community): string | null {
  // Defense in depth: never surface an invite link even if one slips into a public column
  const telegramGroupUrl = !isPrivateGroupInvite(community.telegramGroupUrl)
    ? community.telegramGroupUrl
    : null;
  const telegramUrl = !isPrivateGroupInvite(community.telegramChannelUrl)
    ? community.telegramChannelUrl
    : null;
  const whatsappUrl = !isPrivateGroupInvite(community.whatsappChannelUrl)
    ? community.whatsappChannelUrl
    : null;
  const otherUrl = !isPrivateGroupInvite(community.otherResourceUrl)
    ? community.otherResourceUrl
    : null;
  return (
    community.websiteUrl ??
    community.calendarUrl ??
    community.facebookGroupUrl ??
    community.facebookPageUrl ??
    community.instagramUrl ??
    telegramGroupUrl ??
    telegramUrl ??
    whatsappUrl ??
    community.newsletterUrl ??
    otherUrl ??
    null
  );
}

function sortCommunities(communities: Community[]): Community[] {
  return [...communities].sort((a, b) => {
    const countryCompare = a.country.localeCompare(b.country);
    if (countryCompare !== 0) return countryCompare;
    return a.name.localeCompare(b.name);
  });
}

// Lightweight query for contexts that just need the count + distinct countries (e.g. the
// homepage About section, which unions this with events'/venues' countries for an accurate
// sitewide "across N countries" figure) - avoids pulling all columns of every row just for
// that like getCommunities() below.
export async function getCommunityCountries(): Promise<{ count: number; countries: string[] }> {
  try {
    const supabase = createStaticClient();
    const { data, error } = await supabase
      .from("communities")
      .select("country")
      .is("deleted_at", null);
    if (error) throw new Error(error.message);
    return {
      count: data.length,
      countries: Array.from(new Set(data.map((row) => row.country).filter((c): c is string => !!c))),
    };
  } catch {
    return { count: 0, countries: [] };
  }
}

export async function getCommunities(): Promise<CommunitiesResponse> {
  try {
    // Static (cookie-free) client — see getUpcomingEvents() in lib/events.ts
    // for why: this public listing has no auth-dependent RLS branch, and the
    // cookie-aware client would force dynamic rendering on every request.
    const supabase = createStaticClient();
    const { data, error } = await supabase
      .from("communities")
      .select(
        "id,name,slug,type,city,country,continent,address_for_map,lat,lng,description,website,instagram,facebook_group,facebook_page,telegram_group,telegram_channel,whatsapp_channel,youtube,calendar,newsletter,other_resource,has_invites,has_telegram_invite,has_whatsapp_invite,has_signal_invite,has_line_invite",
      )
      .is("deleted_at", null)
      .order("name");

    if (error) throw new Error(error.message);

    const communities = sortCommunities((data as unknown as CommunityRow[]).map(toCommunity));

    // ISO code as value (matches the events page convention), display label from Intl.DisplayNames.
    // Communities with no country ("Worldwide / several") are excluded here — they get their own
    // "Worldwide" optgroup client-side rather than a fake country entry.
    const isoToLabel = new Map<string, string>();
    for (const c of communities) {
      if (c.countryIso) isoToLabel.set(c.countryIso, c.country);
    }
    const uniqueCountries = Array.from(isoToLabel.entries())
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([value, label]) => ({ value, label }));

    return {
      communities,
      countries: uniqueCountries,
      communityCount: communities.length,
      countryCount: uniqueCountries.length,
      error: null,
    };
  } catch (error) {
    return {
      communities: [],
      countries: [],
      communityCount: 0,
      countryCount: 0,
      error:
        error instanceof Error ? error.message : "Failed to load communities. Please try again later.",
    };
  }
}

function hasSupabaseEnv() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export async function getCommunityBySlug(slug: string): Promise<CommunityDetail | null> {
  if (!hasSupabaseEnv()) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("communities")
    .select(`
      id, name, slug, type, verified, city, country, region, continent,
      lat, lng, description, focus, activity_level, languages, audience_size,
      friendliness, contact_person, website, instagram, facebook_group,
      facebook_page, telegram_group, telegram_channel, whatsapp_channel,
      youtube, calendar, newsletter, other_resource,
      has_invites, has_telegram_invite, has_whatsapp_invite, has_signal_invite, has_line_invite,
      community_venues ( venue:venue_id ( slug, name, city, description, image_url ) ),
      community_profiles ( profile:profile_id ( slug, name, city, bio, image_url, website, instagram, facebook ) )
    `)
    .eq("slug", slug)
    .is("deleted_at", null)
    .single();

  if (error || !data) return null;

  type AssociatedProfileRow = {
    slug: string;
    name: string;
    city: string | null;
    bio: string | null;
    image_url: string | null;
    website: string | null;
    instagram: string | null;
    facebook: string | null;
  };

  type AssociatedVenueRow = { slug: string; name: string; city: string | null; description: string | null; image_url: string | null };

  const { community_venues, community_profiles, ...rest } = data as typeof data & {
    community_venues: { venue: AssociatedVenueRow | AssociatedVenueRow[] | null }[];
    community_profiles: { profile: AssociatedProfileRow | AssociatedProfileRow[] | null }[];
  };

  return {
    ...rest,
    website: normalizeUrl(rest.website),
    instagram: normalizeUrl(rest.instagram),
    facebook_group: normalizeUrl(rest.facebook_group),
    facebook_page: normalizeUrl(rest.facebook_page),
    telegram_group: normalizeUrl(rest.telegram_group),
    telegram_channel: normalizeUrl(rest.telegram_channel),
    whatsapp_channel: normalizeUrl(rest.whatsapp_channel),
    youtube: normalizeUrl(rest.youtube),
    calendar: normalizeUrl(rest.calendar),
    newsletter: normalizeUrl(rest.newsletter),
    other_resource: normalizeUrl(rest.other_resource),
    associatedVenues: (community_venues ?? [])
      .map((row) => (Array.isArray(row.venue) ? row.venue[0] : row.venue))
      .filter((v): v is AssociatedVenueRow => Boolean(v))
      .map((v) => ({ slug: v.slug, name: v.name, city: v.city, description: v.description, imageUrl: v.image_url })),
    associatedPeople: (community_profiles ?? [])
      .map((row) => (Array.isArray(row.profile) ? row.profile[0] : row.profile))
      .filter((p): p is AssociatedProfileRow => Boolean(p))
      .map((p) => ({
        id: p.slug,
        name: p.name,
        slug: p.slug,
        city: p.city,
        bio: p.bio,
        imageUrl: p.image_url,
        // Same fallback order as I-132's country pages (lib/country-pages.ts) — website first,
        // then Instagram, then Facebook.
        linkUrl: p.website ?? p.instagram ?? p.facebook ?? null,
      })),
  } as unknown as CommunityDetail;
}

// I-150 ring: same scope as getCommunities (not deleted), optionally narrowed to one or more
// country ISO codes. Reused across the country/continent/global tiers.
async function fetchCommunityRingPool(countryIsos: string[] | null): Promise<RingEntity[]> {
  if (!hasSupabaseEnv()) return [];
  const supabase = await createClient();
  let query = supabase.from("communities").select("slug, name").is("deleted_at", null);
  if (countryIsos) query = query.in("country", countryIsos);

  const { data, error } = await query;
  if (error || !data) return [];
  return data;
}

// I-150: "also browse" ring neighbors for a community's own detail page. Same country ->
// continent -> global widening as getTeacherRingNeighbors (lib/teachers.ts) — deliberately not
// using the communities.continent column directly, to keep the tiering logic and its thresholds
// identical across all three entity types (see entity-ring.ts).
export async function getCommunityRingNeighbors(
  slug: string,
  country: string | null,
): Promise<RingEntity[]> {
  let pool: RingEntity[] = country ? await fetchCommunityRingPool([country]) : [];

  if (pool.length < RING_MIN_POOL) {
    const continent = getContinent(country);
    if (continent) {
      const continentPool = await fetchCommunityRingPool(getContinentCountries(continent));
      if (continentPool.length > pool.length) pool = continentPool;
    }
  }

  if (pool.length < RING_MIN_POOL) {
    pool = await fetchCommunityRingPool(null);
  }

  return buildRing(pool, slug);
}

export async function getAllCommunitySlugs(): Promise<string[]> {
  if (!hasSupabaseEnv()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("communities")
    .select("slug")
    .is("deleted_at", null);

  if (error || !data) return [];
  return data.map((v) => v.slug);
}

// I-117 follow-up: called only when getCommunityBySlug misses on the exact slug — looks up
// whether it's a superseded one (tracked via the communities_track_slug_history trigger) and
// returns the current slug to redirect to. Mirrors the teacher/venue/event slug-redirect pattern.
export async function resolveCommunitySlugRedirect(slug: string): Promise<string | null> {
  if (!hasSupabaseEnv()) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("communities")
    .select("slug")
    .contains("previous_slugs", [slug])
    .is("deleted_at", null)
    .maybeSingle();

  return data?.slug ?? null;
}

export const COMMUNITY_RELATED_EVENTS_LIMIT = 5;

// I-153: events this community organizes directly (event_organizers.community_id), shown ahead
// of the country-wide list below — those are just "nearby", these are the community's own.
export async function getCommunityOwnEvents(communityId: string) {
  if (!hasSupabaseEnv()) return [];

  const supabase = await createClient();
  const today = new Date().toISOString().split("T")[0];

  const EVENT_COLS = "id, short_id, title, description, type, start_date, end_date, start_time, end_time, timezone, city, country, cancelled, cancelled_text, image_url, links, price, segments, venue_id, lat, lng, status";

  const { data, error } = await supabase
    .from("event_organizers")
    .select(`events (${EVENT_COLS})`)
    .eq("community_id", communityId);

  if (error || !data) {
    console.error("Error fetching community's own events:", error);
    return [];
  }

  type Row = { events: (SupabaseEventRow & { status: string }) | (SupabaseEventRow & { status: string })[] | null };
  const events = (data as Row[])
    .map((row) => (Array.isArray(row.events) ? row.events[0] : row.events))
    .filter((e): e is SupabaseEventRow & { status: string } => Boolean(e) && e!.status === "published" && e!.end_date >= today)
    .sort((a, b) => a.start_date.localeCompare(b.start_date));

  return events.map(mapEventRow);
}

export async function getCommunityEventsByCountry(countryIso: string | null) {
  if (!hasSupabaseEnv() || !countryIso) return [];

  const supabase = await createClient();
  const today = new Date().toISOString().split("T")[0];

  const EVENT_COLS = "id, short_id, title, description, type, start_date, end_date, start_time, end_time, timezone, city, country, cancelled, cancelled_text, image_url, links, price, segments, venue_id, lat, lng";

  const { data, error } = await supabase
    .from("events")
    .select(EVENT_COLS)
    .eq("country", countryIso)
    .eq("status", "published")
    .gte("end_date", today)
    .order("start_date", { ascending: true })
    .limit(COMMUNITY_RELATED_EVENTS_LIMIT);

  if (error) {
    console.error("Error fetching community events by country:", error);
    return [];
  }

  return (data as SupabaseEventRow[]).map(mapEventRow);
}
