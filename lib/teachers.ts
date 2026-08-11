import { createClient } from "@/lib/supabase/server";
import { createClient as createStaticClient } from "@/lib/supabase/static";
import { type SupabaseEventRow, mapEventRow } from "./events";
import { type EventListItem } from "./event-display";
import { getContinent, getContinentCountries } from "./entity-continents";
import { buildRing, RING_MIN_POOL, type RingEntity } from "./entity-ring";

function hasSupabaseEnv() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export type TeacherProfile = {
  id: string;
  name: string;
  slug: string;
  bio: string | null;
  city: string | null;
  country: string | null;
  is_nomadic: boolean;
  website: string | null;
  public_email: string | null;
  instagram: string | null;
  facebook: string | null;
  youtube: string | null;
  telegram: string | null;
  newsletter: string | null;
  is_teacher: boolean;
  is_organizer: boolean;
  is_musician: boolean;
  significant_teachers: string | null;
  year_starting_practice: number | null;
  year_starting_teaching: number | null;
  // I-135: teacher's own practice(s), same vocabulary as events.discipline. UI label "Practice".
  // Fetched via getTeacherBySlug's select("*"); NULL until backfilled (I-098 pattern).
  discipline: string[] | null;
  visibility: string;
  show_in_list: boolean;
  image_url: string | null;
  image_credit: string | null;
  image_status: string;
  event_count?: number;
  user_id: string | null;
  claim_pending_user_id: string | null;
};

export async function getAllPublicTeachers(): Promise<TeacherProfile[]> {
  if (!hasSupabaseEnv()) {
    return [];
  }
  const supabase = await createClient();

  // Fetch teachers
  const { data: teachers, error } = await supabase
    .from("profiles")
    .select(`
      id, name, slug, city, country, is_nomadic,
      is_teacher, is_organizer, is_musician,
      visibility, show_in_list
    `)
    .eq("is_teacher", true)
    .eq("visibility", "public")
    .eq("show_in_list", true)
    .order("name", { ascending: true });

  if (error || !teachers) {
    console.error("Error fetching teachers:", error);
    return [];
  }

  // Fetch event counts for these teachers (published only)
  const teacherIds = teachers.map(t => t.id);
  const { data: eventCounts, error: countsError } = await supabase
    .from("event_teachers")
    .select("teacher_id, events!inner(status)")
    .in("teacher_id", teacherIds)
    .eq("events.status", "published");

  const countsMap: Record<string, number> = {};
  if (!countsError && eventCounts) {
    eventCounts.forEach(ec => {
      countsMap[ec.teacher_id] = (countsMap[ec.teacher_id] || 0) + 1;
    });
  }

  return teachers.map(t => ({
    ...t,
    event_count: countsMap[t.id] || 0
  })) as TeacherProfile[];
}

// I-150: lightweight list for the /teachers page's plain server-rendered index (EntityIndex),
// which pulls the Suspense-equivalent /teachers "coming soon" stub out of a JS-only dead end.
// Uses the static (cookie-free) client — same reasoning as getCommunities()/getVenues(): no
// auth-dependent RLS branch here, and the cookie-aware client would force this list page dynamic
// on every request instead of the ISR it had before (confirmed via a real prod build: switching
// this to createClient() flipped /teachers from ○ static to ƒ dynamic).
export async function getAllPublicTeachersForIndex(): Promise<Pick<TeacherProfile, "slug" | "name" | "country">[]> {
  if (!hasSupabaseEnv()) return [];
  const supabase = createStaticClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("slug, name, country")
    .eq("is_teacher", true)
    .eq("visibility", "public")
    .eq("show_in_list", true);

  if (error || !data) return [];
  return data;
}

export async function getTeacherBySlug(slug: string): Promise<TeacherProfile | null> {
  if (!hasSupabaseEnv()) {
    return null;
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("slug", slug)
    .eq("visibility", "public")
    .single();

  if (error || !data) {
    return null;
  }

  return data as TeacherProfile;
}

// I-153: associated communities (community_profiles) and venues (venue_profiles, e.g. a resident
// teacher). Kept as a separate call rather than folded into getTeacherBySlug's select("*") — other
// callers of TeacherProfile don't need this, and junction embeds don't mix with "*".
export async function getProfileAssociations(profileId: string): Promise<{
  communities: { slug: string; name: string; type: string | null; city: string | null; description: string | null }[];
  venues: { slug: string; name: string; role: string | null; city: string | null; description: string | null; imageUrl: string | null }[];
}> {
  if (!hasSupabaseEnv()) return { communities: [], venues: [] };

  const supabase = await createClient();
  const [{ data: communityRows }, { data: venueRows }] = await Promise.all([
    supabase
      .from("community_profiles")
      .select("community:community_id ( slug, name, type, city, description, deleted_at )")
      .eq("profile_id", profileId),
    supabase
      .from("venue_profiles")
      .select("role, venue:venue_id ( slug, name, city, description, image_url )")
      .eq("profile_id", profileId),
  ]);

  type CommunityRowShape = { slug: string; name: string; type: string | null; city: string | null; description: string | null; deleted_at: string | null };
  type VenueRowShape = { slug: string; name: string; city: string | null; description: string | null; image_url: string | null };
  type CommunityRow = { community: CommunityRowShape | CommunityRowShape[] | null };
  type VenueRow = { role: string | null; venue: VenueRowShape | VenueRowShape[] | null };

  const communities = ((communityRows ?? []) as CommunityRow[])
    .map((row) => (Array.isArray(row.community) ? row.community[0] : row.community))
    .filter((c): c is CommunityRowShape => Boolean(c) && !c!.deleted_at)
    .map(({ slug, name, type, city, description }) => ({ slug, name, type, city, description }));

  const venues = ((venueRows ?? []) as VenueRow[])
    .map((row) => ({ role: row.role, venue: Array.isArray(row.venue) ? row.venue[0] : row.venue }))
    .filter((row): row is { role: string | null; venue: VenueRowShape } => Boolean(row.venue))
    .map(({ role, venue }) => ({ slug: venue.slug, name: venue.name, role, city: venue.city, description: venue.description, imageUrl: venue.image_url }));

  return { communities, venues };
}

// I-117: called only when getTeacherBySlug misses on the exact slug — looks up whether it's a
// superseded one (tracked via the profiles_track_slug_history trigger) and returns the current
// slug to redirect to. Mirrors the events short_id redirect in app/events/[eventSlug]/page.tsx.
export async function resolveTeacherSlugRedirect(slug: string): Promise<string | null> {
  if (!hasSupabaseEnv()) {
    return null;
  }
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("slug")
    .contains("previous_slugs", [slug])
    .eq("visibility", "public")
    .maybeSingle();

  return data?.slug ?? null;
}

type TeacherEventItem = EventListItem & { teacher_id?: string; organizer_id?: string; role?: string };

export async function getTeacherEvents(profileId: string): Promise<{
  upcoming: TeacherEventItem[];
  past: TeacherEventItem[];
}> {
  if (!hasSupabaseEnv()) {
    return { upcoming: [], past: [] };
  }
  const supabase = await createClient();
  const fields = `role, teacher_id, events (id, short_id, title, description, type, start_date, end_date, city, country, image_url, lat, lng, status, hide)`;
  const orgFields = `organizer_id, events (id, short_id, title, description, type, start_date, end_date, city, country, image_url, lat, lng, status, hide)`;

  const [{ data: asTeacher }, { data: asOrganizer }] = await Promise.all([
    supabase.from("event_teachers").select(fields).eq("teacher_id", profileId),
    supabase.from("event_organizers").select(orgFields).eq("organizer_id", profileId),
  ]);

  const allRows = [
    ...(asTeacher ?? []).map(r => ({ ...r.events, role: r.role, teacher_id: r.teacher_id })),
    ...(asOrganizer ?? []).map(r => ({ ...r.events, organizer_id: r.organizer_id }))
  ];

  // Deduplicate by event id, keep published + visible archived (same public-visibility rule
  // as getVenueEvents), sort ascending.
  const results: TeacherEventItem[] = [];

  for (const row of allRows) {
    const e = row as unknown as SupabaseEventRow & { status: string, hide?: boolean, teacher_id?: string, organizer_id?: string, role?: string };
    if (!e) continue;
    const isVisible = e.status === "published" || (e.status === "archived" && e.hide === false);
    if (!isVisible) continue;

    // We might have the same event twice (as teacher AND organizer).
    // We want to keep both pieces of info for role derivation, OR just make sure we don't drop them.
    // If we want a deduplicated list for display, but keep all roles...
    // Let's actually keep the first one we see but combine the flags if needed.

    const existing = results.find(r => r.id === e.id);
    if (existing) {
        if (e.teacher_id) {
            existing.teacher_id = e.teacher_id;
            existing.role = e.role;
        }
        if (e.organizer_id) existing.organizer_id = e.organizer_id;
    } else {
        results.push({
            ...mapEventRow(e),
            teacher_id: e.teacher_id,
            organizer_id: e.organizer_id,
            role: e.role
        });
    }
  }

  const today = new Date().toISOString().split("T")[0];
  return {
    upcoming: results
      .filter(e => e.endDate >= today)
      .sort((a, b) => a.startDate.localeCompare(b.startDate)),
    past: results
      .filter(e => e.endDate < today)
      .sort((a, b) => b.startDate.localeCompare(a.startDate)),
  };
}

// I-150 ring: same scope as getAllPublicTeacherSlugs (is_teacher + public), optionally narrowed
// to one or more country ISO codes. Reused across the country/continent/global tiers.
async function fetchTeacherRingPool(countryIsos: string[] | null): Promise<RingEntity[]> {
  if (!hasSupabaseEnv()) return [];
  const supabase = await createClient();
  let query = supabase
    .from("profiles")
    .select("slug, name")
    .eq("is_teacher", true)
    .eq("visibility", "public");
  if (countryIsos) query = query.in("country", countryIsos);

  const { data, error } = await query;
  if (error || !data) return [];
  return data;
}

// I-150: "also browse" ring neighbors for a teacher's own detail page. Widens from the teacher's
// country to its continent to global whenever the narrower pool is too small to yield RING_WIDTH
// distinct neighbors on each side (see entity-ring.ts for the full reasoning).
export async function getTeacherRingNeighbors(
  slug: string,
  country: string | null,
): Promise<RingEntity[]> {
  let pool: RingEntity[] = country ? await fetchTeacherRingPool([country]) : [];

  if (pool.length < RING_MIN_POOL) {
    const continent = getContinent(country);
    if (continent) {
      const continentPool = await fetchTeacherRingPool(getContinentCountries(continent));
      if (continentPool.length > pool.length) pool = continentPool;
    }
  }

  if (pool.length < RING_MIN_POOL) {
    pool = await fetchTeacherRingPool(null);
  }

  return buildRing(pool, slug);
}

export async function getAllPublicTeacherSlugs(): Promise<string[]> {
  if (!hasSupabaseEnv()) {
    return [];
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("slug")
    .eq("is_teacher", true)
    .eq("visibility", "public");

  if (error || !data) {
    return [];
  }

  return data.map(row => row.slug);
}
