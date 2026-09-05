import { createClient } from "@/lib/supabase/server";
import { createClient as createStaticClient } from "@/lib/supabase/static";
import { type SupabaseEventRow, mapEventRow } from "./events";
import { type EventListItem } from "./event-display";
import { getContinent, getContinentCountries } from "./entity-continents";
import { getCountryLabel } from "./event-display";
import { buildRing, RING_MIN_POOL, type RingEntity, type RingTier } from "./entity-ring";
import { safeExternalUrl } from "./url-safety";

function hasSupabaseEnv() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

// Single source of truth for "what role does this person actually hold", shared by the /teachers
// list (getListedPeople) and the detail page (app/teachers/[slug]/page.tsx), which previously
// each derived roles independently and drifted: the detail page has derived from event credits
// since I-115, the list read only the stored is_teacher/is_organizer/is_musician flags. A profile
// credited via event_teachers but never manually flagged (e.g. Abhishek Rajput, found 2026-08-14)
// showed "musician" on the list and "teacher, musician" on its own detail page. Both call sites
// now compute the same three credit booleans from their own event data and pass them here, so a
// flag left unset can never again disagree with what the event data actually says.
//
// Teacher is additionally gated on discipline (2026-08-26): the directory defaults to CI only,
// and organizers/musicians are defined by role, not practice, so the gate applies to teacher
// alone — a musician playing a CI festival stays "musician" even though they don't practice CI
// themselves. No NULL-passthrough: a still-unbackfilled discipline does not count as CI. That
// costs 10 teacher-only, discipline-NULL profiles their listing until backfilled (accepted
// tradeoff, self-corrects as discipline gets filled in) rather than showing unconfirmed non-CI
// teachers by default — deliberately stricter than assuming "no data yet" means "probably CI".
export function deriveRoles(
  flags: { is_teacher: boolean; is_musician: boolean; is_organizer: boolean; discipline: string[] | null },
  credits: { hasTeacherCredit: boolean; hasMusicianCredit: boolean; hasOrganizerCredit: boolean },
): { isTeacher: boolean; isMusician: boolean; isOrganizer: boolean } {
  const practicesCI = flags.discipline?.includes("contact_improvisation") ?? false;
  return {
    isTeacher: (flags.is_teacher || credits.hasTeacherCredit) && practicesCI,
    isMusician: flags.is_musician || credits.hasMusicianCredit,
    isOrganizer: flags.is_organizer || credits.hasOrganizerCredit,
  };
}

// Trims a bio to a one-line row snippet without cutting mid-word. Kept short deliberately: this
// is sent for every listed person (700+), so a generous length would meaningfully grow the page.
function bioSnippet(bio: string | null, maxLength = 140): string | null {
  if (!bio) return null;
  const trimmed = bio.trim();
  if (trimmed.length <= maxLength) return trimmed;
  const cut = trimmed.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
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
  // I-165 F3: existence flag only; the address lives in entity_emails.
  has_email: boolean;
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
// I-074: the browsable listing.
//
// Inclusion is DERIVED (public + credited on at least one published event), not read from
// profiles.show_in_list. That column was populated by a one-off bulk UPDATE on 2026-07-10 and
// nothing has maintained it since: by 2026-08-14 it had drifted to hide 121 qualifying people,
// four of whom had claimed their profile and created an account. Unlike venues, profiles have no
// admin toggle for the flag, so a `false` there carries no editorial decision worth respecting —
// it just means "created after the bulk run". Deriving it means the list can never drift again.
//
// Also deliberately NOT filtered on is_teacher: 34 of these are organizer-only or musician-only,
// and excluding them leaves them reachable only by landing on an event page that credits them.
export type ListedPerson = {
  slug: string;
  name: string;
  city: string | null;
  country: string | null;
  /** getCountryLabel(country) resolved here, server-side only, and never recomputed on the
   * client: Intl.DisplayNames disagrees between Node's ICU data and the browser's for some
   * codes (Node says "Hong Kong SAR China", Chrome says "Hong Kong"), which caused a hydration
   * mismatch when TeachersClient called it live during render. */
  countryLabel: string | null;
  isNomadic: boolean;
  /** Every role held, e.g. ["teacher","organizer"]. Drives both the row label and the role filter.
   * Derived via deriveRoles(), same as the detail page — see the comment on that function. */
  roles: string[];
  imageUrl: string | null;
  linkUrl: string | null;
  /** Short, word-boundary-truncated bio for the row's middle column. Null if no bio on file. */
  bioSnippet: string | null;
  /** True once someone has claimed this profile (profiles.user_id set). Claimed people sort first
   * and get a badge, as an incentive to claim (2026-08-28) — most of the directory is unclaimed
   * profiles we built from event credits, so surfacing the ones a real person owns and maintains
   * is worth more to a visitor than pure alphabetical order. */
  isClaimed: boolean;
};

const LISTED_EVENT_STATUSES = ["published", "archived"];

export async function getListedPeople(): Promise<ListedPerson[]> {
  if (!hasSupabaseEnv()) return [];
  const supabase = createStaticClient();

  const [profileRes, teacherLinkRes, organizerLinkRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, slug, name, city, country, bio, discipline, is_nomadic, is_teacher, is_organizer, is_musician, image_url, image_status, website, instagram, facebook, user_id")
      .eq("visibility", "public")
      .limit(5000),
    // published AND archived: an event is archived when it ends, not deleted (past events stay
    // online as an evergreen record). Filtering to published alone dropped 178 people whose
    // events have simply finished, which is exactly the audience a teacher directory is for.
    // role is fetched (not just teacher_id) so deriveRoles can tell a teaching credit from a
    // musician one, same distinction the detail page has made since I-115.
    supabase.from("event_teachers").select("teacher_id, role, events!inner(status)").in("events.status", LISTED_EVENT_STATUSES).limit(20000),
    supabase.from("event_organizers").select("organizer_id, events!inner(status)").in("events.status", LISTED_EVENT_STATUSES).limit(20000),
  ]);

  if (profileRes.error || !profileRes.data) return [];

  const teacherCredit = new Map<string, { teacher: boolean; musician: boolean }>();
  for (const row of (teacherLinkRes.data ?? []) as { teacher_id: string; role: string | null }[]) {
    const entry = teacherCredit.get(row.teacher_id) ?? { teacher: false, musician: false };
    if (row.role === "musician") entry.musician = true;
    else entry.teacher = true;
    teacherCredit.set(row.teacher_id, entry);
  }
  const organizerCredited = new Set<string>();
  for (const row of (organizerLinkRes.data ?? []) as { organizer_id: string }[]) {
    organizerCredited.add(row.organizer_id);
  }

  const credited = new Set<string>([...teacherCredit.keys(), ...organizerCredited]);

  // Admission is credit-based for organizer/musician (those roles only mean something relative to
  // a specific event), but NOT for teacher: "I teach CI" is a standing identity, not something that
  // requires a submitted event to be true. Requiring a credit here excluded real teachers who only
  // run local classes/jams that never became a listed event (Moti Zemelman, Tadeo San Martin) and
  // undermined manually-added teachers meant to round out a country page (2026-08-26 decision) —
  // is_teacher + a confirmed contact_improvisation discipline tag is itself a deliberate, researched
  // fact, not something that happens by accident, so it's a sufficient bar on its own.
  const isConfirmedTeacher = (p: { is_teacher: boolean; discipline: string[] | null }) =>
    p.is_teacher && (p.discipline?.includes("contact_improvisation") ?? false);

  return profileRes.data
    .filter((p) => credited.has(p.id) || isConfirmedTeacher(p))
    .flatMap((p) => {
      const credit = teacherCredit.get(p.id) ?? { teacher: false, musician: false };
      const { isTeacher, isOrganizer, isMusician } = deriveRoles(
        { is_teacher: p.is_teacher, is_musician: p.is_musician, is_organizer: p.is_organizer, discipline: p.discipline },
        {
          hasTeacherCredit: credit.teacher,
          hasMusicianCredit: credit.musician,
          hasOrganizerCredit: organizerCredited.has(p.id),
        },
      );
      const roles = [
        isTeacher ? "teacher" : null,
        isOrganizer ? "organizer" : null,
        isMusician ? "musician" : null,
      ].filter(Boolean) as string[];
      // A credited-as-teacher-only profile whose practice isn't (yet) tagged as CI loses the
      // teacher role entirely (see deriveRoles) and so has no role left to be listed under.
      if (roles.length === 0) return [];
      return [{
        slug: p.slug,
        name: p.name,
        city: p.city,
        country: p.country,
        countryLabel: p.country ? getCountryLabel(p.country) : null,
        isNomadic: Boolean(p.is_nomadic),
        roles,
        // Pending photos must not appear publicly — the privacy policy states this outright, so
        // presence of image_url is not a sufficient check.
        imageUrl: p.image_status === "approved" ? p.image_url : null,
        linkUrl: safeExternalUrl(p.website ?? p.instagram ?? p.facebook),
        bioSnippet: bioSnippet(p.bio),
        isClaimed: Boolean(p.user_id),
      }];
    })
    .sort((a, b) => {
      if (a.isClaimed !== b.isClaimed) return a.isClaimed ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

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

// I-150 ring: like CompactTeacherRow's prop shape, minus the fields the ring doesn't have/use
// (bio, external linkUrl, role) — city + image so the row visually matches every other place
// CompactTeacherRow already appears (Community/Venue "People" sections).
export type TeacherRingItem = RingEntity & { city: string | null; imageUrl: string | null };

// Same scope as getAllPublicTeacherSlugs (is_teacher + public), optionally narrowed to one or
// more country ISO codes. Reused across the country/continent/global tiers. Only surfaces the
// image when approved (image_status), same gate as the teacher's own detail page.
async function fetchTeacherRingPool(countryIsos: string[] | null): Promise<TeacherRingItem[]> {
  if (!hasSupabaseEnv()) return [];
  const supabase = await createClient();
  let query = supabase
    .from("profiles")
    .select("slug, name, city, image_url, image_status")
    .eq("is_teacher", true)
    .eq("visibility", "public");
  if (countryIsos) query = query.in("country", countryIsos);

  const { data, error } = await query;
  if (error || !data) return [];
  return data.map((row) => ({
    slug: row.slug,
    name: row.name,
    city: row.city,
    imageUrl: row.image_status === "approved" ? row.image_url : null,
  }));
}

// I-150: "also browse" ring neighbors for a teacher's own detail page. Widens from the teacher's
// country to its continent to global whenever the narrower pool is too small to yield RING_WIDTH
// distinct neighbors on each side (see entity-ring.ts for the full reasoning).
export async function getTeacherRingNeighbors(
  slug: string,
  country: string | null,
): Promise<{ tier: RingTier; items: TeacherRingItem[] }> {
  let pool: TeacherRingItem[] = country ? await fetchTeacherRingPool([country]) : [];
  let tier: RingTier = "country";

  if (pool.length < RING_MIN_POOL) {
    const continent = getContinent(country);
    if (continent) {
      const continentPool = await fetchTeacherRingPool(getContinentCountries(continent));
      if (continentPool.length > pool.length) {
        pool = continentPool;
        tier = "continent";
      }
    }
  }

  if (pool.length < RING_MIN_POOL) {
    pool = await fetchTeacherRingPool(null);
    tier = "global";
  }

  return { tier, items: buildRing(pool, slug) };
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
