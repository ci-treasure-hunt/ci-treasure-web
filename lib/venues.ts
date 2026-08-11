import { createClient } from "@/lib/supabase/server";
import { createClient as createStaticClient } from "@/lib/supabase/static";
import { mapEventRow, SupabaseEventRow, LinkItem, getLinkLabel, linkSortKey } from "./events";
import { getContinent, getContinentCountries } from "./entity-continents";
import { buildRing, RING_MIN_POOL, type RingEntity } from "./entity-ring";

// I-153: associated communities (community_venues) and people (venue_profiles, e.g. an owner or
// resident teacher). Separate call, same reasoning as lib/teachers.ts's getProfileAssociations.
export async function getVenueAssociations(venueId: string): Promise<{
  communities: { slug: string; name: string; type: string | null; city: string | null; description: string | null }[];
  people: { slug: string; name: string; role: string | null; city: string | null; bio: string | null; imageUrl: string | null; linkUrl: string | null }[];
}> {
  if (!hasSupabaseEnv()) return { communities: [], people: [] };

  const supabase = await createClient();
  const [{ data: communityRows }, { data: peopleRows }] = await Promise.all([
    supabase
      .from("community_venues")
      .select("community:community_id ( slug, name, type, city, description, deleted_at )")
      .eq("venue_id", venueId),
    supabase
      .from("venue_profiles")
      .select("role, profile:profile_id ( slug, name, city, bio, image_url, website, instagram, facebook )")
      .eq("venue_id", venueId),
  ]);

  type CommunityRowShape = { slug: string; name: string; type: string | null; city: string | null; description: string | null; deleted_at: string | null };
  type PeopleRowShape = { slug: string; name: string; city: string | null; bio: string | null; image_url: string | null; website: string | null; instagram: string | null; facebook: string | null };
  type CommunityRow = { community: CommunityRowShape | CommunityRowShape[] | null };
  type PeopleRow = { role: string | null; profile: PeopleRowShape | PeopleRowShape[] | null };

  const communities = ((communityRows ?? []) as CommunityRow[])
    .map((row) => (Array.isArray(row.community) ? row.community[0] : row.community))
    .filter((c): c is CommunityRowShape => Boolean(c) && !c!.deleted_at)
    .map(({ slug, name, type, city, description }) => ({ slug, name, type, city, description }));

  const people = ((peopleRows ?? []) as PeopleRow[])
    .map((row) => ({ role: row.role, profile: Array.isArray(row.profile) ? row.profile[0] : row.profile }))
    .filter((row): row is { role: string | null; profile: PeopleRowShape } => Boolean(row.profile))
    .map(({ role, profile }) => ({
      slug: profile.slug,
      name: profile.name,
      role,
      city: profile.city,
      bio: profile.bio,
      imageUrl: profile.image_url,
      linkUrl: profile.website ?? profile.instagram ?? profile.facebook ?? null,
    }));

  return { communities, people };
}

function normalizeAddress(raw: unknown): string | null {
  if (!raw) return null;
  if (typeof raw === "string") {
    if (raw.trimStart().startsWith("{")) {
      try { return normalizeAddress(JSON.parse(raw)); } catch { /* fall through */ }
    }
    return raw;
  }
  if (typeof raw === "object" && raw !== null) {
    const obj = raw as Record<string, unknown>;
    const text = obj.full ?? obj.text ?? obj.venue_name ?? null;
    return typeof text === "string" ? text : null;
  }
  return null;
}

export type Venue = {
  id: string;
  name: string;
  slug: string;
  city: string;
  country: string;
  region: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  description: string | null;
  website: string | null;
  imageUrl: string | null;
  imageCredit: string | null;
  email: string | null;
  newsletter: string | null;
  instagram: string | null;
  facebook: string | null;
  youtube: string | null;
  links: { items: LinkItem[] } | null;
};

function hasSupabaseEnv() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export async function getVenueBySlug(slug: string): Promise<Venue | null> {
  if (!hasSupabaseEnv()) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("venues")
    .select("*")
    .eq("slug", slug)
    .eq("visibility", "public")
    .single();

  if (error || !data) return null;

  return {
    id: data.id,
    name: data.name,
    slug: data.slug,
    city: data.city,
    country: data.country,
    region: data.region,
    address: normalizeAddress(data.address),
    lat: data.lat,
    lng: data.lng,
    description: data.description,
    website: data.website,
    imageUrl: data.image_url,
    imageCredit: data.image_credit ?? null,
    email: data.email,
    newsletter: data.newsletter,
    instagram: data.instagram,
    facebook: data.facebook,
    youtube: data.youtube,
    links: data.links,
  };
}

export async function getVenueEvents(venueId: string) {
  if (!hasSupabaseEnv()) return { upcoming: [], past: [] };

  const supabase = await createClient();
  const today = new Date().toISOString().split("T")[0];

  const EVENT_COLS = "id, short_id, title, description, type, start_date, end_date, start_time, end_time, timezone, city, country, cancelled, cancelled_text, image_url, links, price, segments, venue_id, lat, lng";

  const { data: upcoming, error: upcomingError } = await supabase
    .from("events")
    .select(EVENT_COLS)
    .eq("venue_id", venueId)
    .eq("status", "published")
    .gte("end_date", today)
    .order("start_date", { ascending: true });

  // Past events transition to status='archived' once their end_date passes (confirmed:
  // zero 'published' rows have a past end_date). events_select_public RLS covers both
  // 'published' and 'archived' (I-112), so the normal session client sees these directly.
  const { data: past, error: pastError } = await supabase
    .from("events")
    .select(EVENT_COLS)
    .eq("venue_id", venueId)
    .eq("status", "archived")
    .eq("hide", false)
    .lt("end_date", today)
    .order("start_date", { ascending: false });

  if (upcomingError) console.error("Error fetching upcoming venue events:", upcomingError);
  if (pastError) console.error("Error fetching past venue events:", pastError);

  return {
    upcoming: ((upcoming ?? []) as SupabaseEventRow[]).map(mapEventRow),
    past: ((past ?? []) as SupabaseEventRow[]).map(mapEventRow),
  };
}

export type VenueLinkItem = { type: string; url: string; label: string };

export type VenueListItem = {
  id: string;
  name: string;
  slug: string;
  city: string;
  country: string; // display label, e.g. "Germany"
  countryIso: string;
  description: string | null;
  website: string | null;
  imageUrl: string | null;
  // Community-channel-style links (telegram, whatsapp, signal, facebook group, etc.) —
  // "website" is excluded here since it's already broken out above.
  channelLinks: VenueLinkItem[];
};

export type VenuesResponse = {
  venues: VenueListItem[];
  countries: Array<{ value: string; label: string }>;
  venueCount: number;
  countryCount: number;
  error: string | null;
};

const venueCountryNames = new Intl.DisplayNames(["en"], { type: "region" });

function venueCountryLabel(iso: string): string {
  try {
    return venueCountryNames.of(iso) ?? iso;
  } catch {
    return iso;
  }
}

function ensureHttps(url: string): string {
  return url.startsWith("http") ? url : `https://${url}`;
}

type VenueListRow = {
  id: string;
  name: string;
  slug: string;
  city: string;
  country: string;
  description: string | null;
  website: string | null;
  image_url: string | null;
  instagram: string | null;
  facebook: string | null;
  youtube: string | null;
  links: { items: LinkItem[] } | null;
};

function toVenueListItem(row: VenueListRow): VenueListItem {
  const rawItems = (row.links?.items ?? []).filter((item) => item.type !== "website");
  // instagram/facebook/youtube live in their own columns, not the links jsonb — fold them
  // into the same channel-link list so the card only needs one loop.
  if (row.instagram) rawItems.push({ type: "instagram", url: row.instagram });
  if (row.facebook) rawItems.push({ type: "facebook", url: row.facebook });
  if (row.youtube) rawItems.push({ type: "youtube", url: row.youtube });

  const channelLinks = rawItems
    .map((item) => ({
      type: item.type,
      url: ensureHttps(item.url),
      label: getLinkLabel(item.type, item.label),
    }))
    .sort((a, b) => linkSortKey(a.type) - linkSortKey(b.type));

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    city: row.city,
    country: venueCountryLabel(row.country),
    countryIso: row.country,
    description: row.description,
    website: row.website ? ensureHttps(row.website) : null,
    imageUrl: row.image_url,
    channelLinks,
  };
}

// Lightweight query for contexts that just need the count + distinct countries (e.g. the
// homepage About section, which unions this with events'/communities' countries for an
// accurate sitewide "across N countries" figure) - avoids pulling all columns of every row
// just for that like getVenues() above.
export async function getVenueCountries(): Promise<{ count: number; countries: string[] }> {
  try {
    const supabase = createStaticClient();
    const { data, error } = await supabase
      .from("venues")
      .select("country")
      .eq("visibility", "public")
      .eq("show_in_list", true);
    if (error) throw new Error(error.message);
    return {
      count: data.length,
      countries: Array.from(new Set(data.map((row) => row.country))),
    };
  } catch {
    return { count: 0, countries: [] };
  }
}

export async function getVenues(): Promise<VenuesResponse> {
  try {
    // Static (cookie-free) client — see getUpcomingEvents() in lib/events.ts
    // for why: this public listing has no auth-dependent RLS branch, and the
    // cookie-aware client would force dynamic rendering on every request.
    const supabase = createStaticClient();
    const { data, error } = await supabase
      .from("venues")
      .select("id,name,slug,city,country,description,website,image_url,instagram,facebook,youtube,links")
      .eq("visibility", "public")
      .eq("show_in_list", true)
      .order("country")
      .order("name");

    if (error) throw new Error(error.message);

    const venues = (data as unknown as VenueListRow[]).map(toVenueListItem);

    const isoToLabel = new Map<string, string>();
    for (const v of venues) isoToLabel.set(v.countryIso, v.country);
    const countries = Array.from(isoToLabel.entries())
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([value, label]) => ({ value, label }));

    return {
      venues,
      countries,
      venueCount: venues.length,
      countryCount: countries.length,
      error: null,
    };
  } catch (error) {
    return {
      venues: [],
      countries: [],
      venueCount: 0,
      countryCount: 0,
      error:
        error instanceof Error ? error.message : "Failed to load venues. Please try again later.",
    };
  }
}

// I-150 ring: same scope as getVenues (public + show_in_list), optionally narrowed to one or
// more country ISO codes. Reused across the country/continent/global tiers.
async function fetchVenueRingPool(countryIsos: string[] | null): Promise<RingEntity[]> {
  if (!hasSupabaseEnv()) return [];
  const supabase = await createClient();
  let query = supabase
    .from("venues")
    .select("slug, name")
    .eq("visibility", "public")
    .eq("show_in_list", true);
  if (countryIsos) query = query.in("country", countryIsos);

  const { data, error } = await query;
  if (error || !data) return [];
  return data;
}

// I-150: "also browse" ring neighbors for a venue's own detail page. Same country -> continent
// -> global widening as getTeacherRingNeighbors (lib/teachers.ts).
export async function getVenueRingNeighbors(
  slug: string,
  country: string | null,
): Promise<RingEntity[]> {
  let pool: RingEntity[] = country ? await fetchVenueRingPool([country]) : [];

  if (pool.length < RING_MIN_POOL) {
    const continent = getContinent(country);
    if (continent) {
      const continentPool = await fetchVenueRingPool(getContinentCountries(continent));
      if (continentPool.length > pool.length) pool = continentPool;
    }
  }

  if (pool.length < RING_MIN_POOL) {
    pool = await fetchVenueRingPool(null);
  }

  return buildRing(pool, slug);
}

export async function getAllVenueSlugs(): Promise<string[]> {
  if (!hasSupabaseEnv()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("venues")
    .select("slug")
    .eq("visibility", "public");
  if (error || !data) return [];
  return data.map((v) => v.slug);
}

// I-117 follow-up: called only when getVenueBySlug misses on the exact slug — looks up whether
// it's a superseded one (tracked via the venues_track_slug_history trigger) and returns the
// current slug to redirect to. Mirrors the teacher/event slug-redirect pattern.
export async function resolveVenueSlugRedirect(slug: string): Promise<string | null> {
  if (!hasSupabaseEnv()) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("venues")
    .select("slug")
    .contains("previous_slugs", [slug])
    .eq("visibility", "public")
    .maybeSingle();

  return data?.slug ?? null;
}
