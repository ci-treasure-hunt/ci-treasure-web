import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createClient as createStaticClient } from "@/lib/supabase/static";
import { createAdminClient } from "@/lib/supabase/admin";
import { safeExternalUrl } from "@/lib/url-safety";
import { getEntityEmail } from "@/lib/entity-email";
import {
  type EventListItem,
  type SegmentItem,
  type SegmentsData,
  GENERIC_ACCENT_GRADIENT,
  disciplineLabel,
} from "@/lib/event-display";

export type SupabaseEventRow = {
  id: string;
  short_id: string;
  title: string;
  description: string | null;
  type: string;
  start_date: string;
  end_date: string;
  start_time: string | null;
  end_time: string | null;
  timezone: string;
  city: string;
  country: string;
  cancelled: boolean;
  cancelled_text: string | null;
  image_url: string | null;
  image_credit?: string | null;
  links: unknown;
  price: unknown;
  segments: unknown;
  venue_id: string | null;
  address: { venue_name?: string } | null;
  lat: number | null;
  lng: number | null;
  has_email?: boolean | null;
  series_id?: string | null;
  series_order?: number | null;
  event_series?: { title: string } | null;
  discipline?: string[] | null;
  level?: string | null;
  language?: string[] | null;
};

export type SeriesSibling = {
  id: string;
  shortId: string;
  slug: string;
  title: string;
  type: string;
  startDate: string;
  endDate: string;
  seriesOrder: number | null;
};

// Shape returned by the get_event_credited_people RPC (lib/events.ts's getEventBySlug) —
// already flat, unlike a nested Supabase join.
type SupabaseProfileJoinFlat = {
  role?: string | null;
  name?: string | null;
  slug?: string | null;
  visibility?: string | null;
  is_claimed?: boolean | null;
};

export type LinkItem = {
  type: string;
  url: string;
  label?: string;
};

export type PriceItem = {
  amount: number | null;
  currency: string;
  description?: string;
};

export type EventDetail = EventListItem & {
  startTime: string | null;
  endTime: string | null;
  timezone: string;
  cancelledText: string | null;
  linkItems: LinkItem[];
  priceItems: PriceItem[];
  segments: SegmentsData | null;
  teachers: Array<{ name: string; role?: string | null; slug?: string | null }>;
  organizers: Array<{ name: string; role?: string | null; slug?: string | null }>;
  // I-153: event_organizers.community_id — a community credited as organizer-of-record,
  // additive alongside the person-level organizers above (e.g. Confluence is organized by
  // Francisco Borges/Alexa Papa/Viktória Makra AND presented by Assembly).
  organizingCommunities: Array<{ name: string; slug: string; type: string | null; city: string | null; description: string | null }>;
  venueName: string | null;
  venueAddress: string | null;
  venueSlug: string | null;
  primaryRegistrationUrl: string | null;
  startDateIso: string;
  endDateIso: string;
  // I-165 F3: whether an address exists, for the reveal button. The address itself lives in
  // entity_emails and is never fetched into a public render.
  hasEmail: boolean;
  // Populated only on the admin preview path (getEventDetailForAdmin), which is allowed to
  // show it as plain text. Always null in public renders.
  contactEmail: string | null;
  level: string | null;
  language: string[];
  seriesName: string | null;
  seriesSiblings: SeriesSibling[];
  imageCredit: string | null;
  // True for archived (past) events — the page renders an "event has ended" state.
  isPast: boolean;
  // True when at least one organizer on this event has no linked auth user yet, OR no
  // organizer is credited at all (82 events as of 2026-07-20) — either way there's a real
  // person who could self-serve into ownership. Drives the "claim your event" CTA (I-118).
  hasUnclaimedOrganizer: boolean;
  // Distinguishes the two hasUnclaimedOrganizer cases so the CTA copy can be accurate —
  // "claim it" implies an existing organizer credit to take over, which isn't true when
  // there's nothing credited yet.
  hasNoOrganizer: boolean;
};

function hasSupabaseEnv() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

const SLUG_CHAR_MAP: Record<string, string> = {
  ł: "l", ø: "o", ß: "ss", đ: "d", ð: "d", þ: "th", æ: "ae", å: "a",
};

export function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[łøßđðþæå]/g, (c) => SLUG_CHAR_MAP[c] ?? c)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Revised 2026-09-02 (I-167): festival/retreat/workshop originally all pivoted through nearly the
// same dark teal mid-stop and read as near-duplicates side by side. Reassigned each to a distinct
// association instead — festival: fire/sunset, retreat: forest/dawn, workshop: studio/paper — and
// added intensive (heat/immersion) and long_jam (night/lamplight) so every type page gets its own
// hero identity, not just a fallback to GENERIC_ACCENT_GRADIENT.
export function mapAccent(type: string) {
  const palette: Record<string, string> = {
    festival:
      "bg-[radial-gradient(circle_at_15%_20%,rgba(255,140,90,0.45),transparent_22%),linear-gradient(135deg,#17313b_0%,#e0563a_52%,#ffcf5c_100%)]",
    retreat:
      "bg-[radial-gradient(circle_at_80%_20%,rgba(250,222,150,0.4),transparent_26%),linear-gradient(135deg,#1f4a3d_0%,#7a9c52_50%,#f6e2b8_100%)]",
    training:
      "bg-[radial-gradient(circle_at_50%_10%,rgba(255,255,255,0.3),transparent_22%),linear-gradient(135deg,#2d2748_0%,#875c52_52%,#f0c38e_100%)]",
    workshop:
      "bg-[radial-gradient(circle_at_22%_18%,rgba(255,255,255,0.3),transparent_18%),linear-gradient(135deg,#2f3550_0%,#5b6fa8_55%,#ede3cf_100%)]",
    intensive:
      "bg-[radial-gradient(circle_at_25%_15%,rgba(242,90,90,0.35),transparent_22%),linear-gradient(135deg,#2b0f1f_0%,#8c2f3a_50%,#f4a259_100%)]",
    long_jam:
      "bg-[radial-gradient(circle_at_75%_15%,rgba(255,255,255,0.3),transparent_24%),linear-gradient(135deg,#141b2e_0%,#2f4d6b_50%,#e2b26b_100%)]",
  };

  return palette[type] ?? GENERIC_ACCENT_GRADIENT;
}

export function mapEventRow(row: SupabaseEventRow): EventListItem {
  return {
    id: row.id,
    shortId: row.short_id,
    slug: `${row.short_id}-${slugify(row.title)}`,
    title: row.title,
    description: row.description,
    type: row.type,
    startDate: row.start_date,
    endDate: row.end_date,
    city: row.city,
    country: row.country,
    imageUrl: row.image_url,
    accentClass: mapAccent(row.type),
    lat: row.lat,
    lng: row.lng,
    discipline: row.discipline ?? [],
    cancelled: row.cancelled,
  };
}

export const LINK_CANONICAL_ORDER: Record<string, number> = {
  // Event link order (unchanged from original)
  website: 0, registration: 1, info_pack: 2, schedule: 3,
  facebook_event: 4, video: 5, telegram: 6, whatsapp: 7,
  instagram: 8, youtube: 9, other: 10,
  // Social page variants — facebook profile/group sorts near instagram, not with facebook_event
  facebook: 8, facebook_page: 8, facebook_group: 8,
  telegram_group: 6, telegram_channel: 6,
  whatsapp_channel: 7,
  newsletter: 11, calendar: 12,
  // legacy aliases
  info: 2, program: 3,
};

export function linkSortKey(type: string): number {
  return LINK_CANONICAL_ORDER[type] ?? 14;
}

function normalizeLinkItems(payload: unknown): LinkItem[] {
  const rawItems =
    typeof payload === "object" && payload && "items" in payload
      ? (payload as { items?: unknown[] }).items
      : [];

  if (!Array.isArray(rawItems)) {
    return [];
  }

  return rawItems
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const typed = item as { type?: unknown; url?: unknown; label?: unknown };
      const type = typeof typed.type === "string" ? typed.type : "website";
      const rawUrl = typeof typed.url === "string" ? typed.url : "";
      const label = typeof typed.label === "string" ? typed.label : undefined;
      // I-165: never hand an unchecked scheme to an href. Enforced on read as well as on write
      // (parseLinkItems), so rows already in the DB and any future write path that skips
      // parseLinkItems are both covered.
      const url = safeExternalUrl(rawUrl);
      if (!url) {
        if (rawUrl) {
          // Redact anything that looks like an address before logging: a bare email in `links` is
          // one of the things that lands here (see BARE_EMAIL in lib/organizer-events.ts), and
          // writing it to the runtime log would undercut the point of keeping emails gated.
          console.warn(
            `[links] dropped unsafe or unparseable URL (type=${type}): ` +
              rawUrl.replace(/[^\s@]+@[^\s@]+/g, "<redacted-email>").slice(0, 120),
          );
        }
        return null;
      }
      return { type, url, ...(label ? { label } : {}) };
    })
    .filter((item): item is LinkItem => Boolean(item))
    .sort((a, b) => linkSortKey(a.type) - linkSortKey(b.type));
}

function normalizePriceItems(payload: unknown): PriceItem[] {
  const rawItems =
    typeof payload === "object" && payload && "items" in payload
      ? (payload as { items?: unknown[] }).items
      : [];

  if (!Array.isArray(rawItems)) {
    return [];
  }

  const items: Array<PriceItem | null> = rawItems.map((item) => {
    if (!item || typeof item !== "object") {
      return null;
    }
    const typed = item as { amount?: unknown; currency?: unknown; description?: unknown };
    return {
      amount: typeof typed.amount === "number" ? typed.amount : null,
      currency: typeof typed.currency === "string" ? typed.currency : "EUR",
      description: typeof typed.description === "string" ? typed.description : undefined,
    };
  });

  return items.filter((item): item is PriceItem => item !== null);
}

function normalizeSegments(payload: unknown): SegmentsData | null {
  if (typeof payload !== "object" || !payload || !("items" in payload)) {
    return null;
  }

  const rawItems = (payload as { items?: unknown[] }).items;
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return null;
  }

  const items = rawItems
    .map((item): SegmentItem | null => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const typed = item as {
        title?: unknown;
        start_date?: unknown;
        end_date?: unknown;
        teachers?: unknown;
        description?: unknown;
      };

      if (typeof typed.title !== "string" || !typed.title) {
        return null;
      }

      return {
        title: typed.title,
        startDate: typeof typed.start_date === "string" ? typed.start_date : undefined,
        endDate: typeof typed.end_date === "string" ? typed.end_date : undefined,
        teachers: Array.isArray(typed.teachers)
          ? typed.teachers.filter((t): t is string => typeof t === "string")
          : undefined,
        description: typeof typed.description === "string" ? typed.description : undefined,
      };
    })
    .filter((item): item is SegmentItem => item !== null);

  if (items.length === 0) return null;
  return { items };
}

function normalizePeopleFlat(rows: SupabaseProfileJoinFlat[] | null | undefined) {
  const items: Array<{ name: string; role: string | null; slug: string | null } | null> = (
    rows ?? []
  ).map((row) => {
    const name = row.name?.trim();
    if (!name) {
      return null;
    }
    return {
      name,
      role: row.role ?? null,
      // Name stays visible either way (it's the event's own historical record — who
      // actually taught/organized it), but only link to a profile page that actually
      // exists publicly. Shadow (never claimed) and deactivated (self-hidden) profiles
      // show as plain text, same treatment for both.
      slug: row.visibility === "public" ? row.slug ?? null : null,
    };
  });

  return items.filter(
    (item): item is { name: string; role: string | null; slug: string | null } => item !== null,
  );
}

export async function getUpcomingEvents(today: string): Promise<{ events: EventListItem[]; error: string | null }> {
  if (!hasSupabaseEnv()) {
    return {
      events: [],
      error: "Supabase environment variables are missing, so the public calendar cannot load yet.",
    };
  }

  try {
    // Static (cookie-free) client: this is a public, single-purpose homepage
    // query with no auth-dependent RLS branch, and calling next/headers'
    // cookies() (via the default createClient()) would force this route to
    // render dynamically on every request, defeating the page's `revalidate`.
    const supabase = createStaticClient();
    const { data, error } = await supabase
      .from("events")
      .select("id, short_id, title, description, type, start_date, end_date, city, country, image_url, lat, lng, discipline, cancelled")
      .eq("status", "published")
      .gte("end_date", today)
      .order("start_date", { ascending: true });

    if (error) {
      return { events: [], error: `Could not load public events: ${error.message}` };
    }

    return {
      events: ((data ?? []) as SupabaseEventRow[]).map(mapEventRow),
      error: null,
    };
  } catch (error) {
    return {
      events: [],
      error:
        error instanceof Error
          ? `Could not load public events: ${error.message}`
          : "Could not load public events.",
    };
  }
}

export type TypeListItem = EventListItem & {
  // Set when this row represents a deduped recurring series (I-167) — the count of additional
  // upcoming occurrences folded into this one row, so callers can render a "+N more dates" hint
  // instead of listing the same series title repeatedly.
  seriesExtraDates?: number;
};

// I-167: one row per type-listing page (/festivals, /workshops, /retreats, /intensives,
// /long-jams). Deliberately its own query rather than a client-side filter of
// getUpcomingEvents()'s payload — that's exactly the pattern the homepage's `?type=` filter is
// excluded from search indexing for (filters live in client state, not in what got fetched), and
// these pages exist specifically to be crawlable.
export async function getEventsByType(type: string, today: string): Promise<{ events: TypeListItem[]; error: string | null }> {
  if (!hasSupabaseEnv()) {
    return {
      events: [],
      error: "Supabase environment variables are missing, so this listing cannot load yet.",
    };
  }

  try {
    const supabase = createStaticClient();
    const { data, error } = await supabase
      .from("events")
      .select("id, short_id, title, description, type, start_date, end_date, city, country, image_url, lat, lng, discipline, cancelled, series_id")
      .eq("status", "published")
      .eq("type", type)
      .contains("discipline", ["contact_improvisation"])
      .gte("end_date", today)
      .order("start_date", { ascending: true });

    if (error) {
      return { events: [], error: `Could not load ${type} events: ${error.message}` };
    }

    const rows = (data ?? []) as (SupabaseEventRow & { series_id?: string | null })[];

    // Dedupe recurring series (e.g. a monthly retreat with 8 upcoming occurrences) down to their
    // next occurrence, so one series doesn't dominate a listing meant to show variety. Rows are
    // already sorted by start_date, so the first row seen per series_id is the earliest — count
    // how many total rows share that series_id first, then keep only that first one.
    const seriesTotals = new Map<string, number>();
    for (const row of rows) {
      if (row.series_id) seriesTotals.set(row.series_id, (seriesTotals.get(row.series_id) ?? 0) + 1);
    }

    const seenSeries = new Set<string>();
    const events: TypeListItem[] = [];
    for (const row of rows) {
      if (row.series_id) {
        if (seenSeries.has(row.series_id)) continue;
        seenSeries.add(row.series_id);
      }
      const event: TypeListItem = mapEventRow(row);
      const total = row.series_id ? seriesTotals.get(row.series_id) ?? 1 : 1;
      if (total > 1) event.seriesExtraDates = total - 1;
      events.push(event);
    }

    return { events, error: null };
  } catch (error) {
    return {
      events: [],
      error:
        error instanceof Error
          ? `Could not load ${type} events: ${error.message}`
          : `Could not load ${type} events.`,
    };
  }
}

function getTimezoneOffset(timezone: string, date: Date) {
  try {
    const parts = new Intl.DateTimeFormat("en", {
      timeZone: timezone,
      timeZoneName: "longOffset",
    }).formatToParts(date);
    const offset = parts.find((p) => p.type === "timeZoneName")?.value ?? "";
    // offset is something like "GMT+02:00" or "GMT-05:00" or "GMT"
    if (offset === "GMT") return "+00:00";
    return offset.replace("GMT", "");
  } catch {
    return "+00:00";
  }
}

const EVENT_DETAIL_COLUMNS =
  "id, short_id, title, description, type, start_date, end_date, start_time, end_time, timezone, city, country, cancelled, cancelled_text, image_url, image_credit, links, price, segments, venue_id, address, has_email, series_id, series_order, status, level, language, discipline, event_series(title)";

// Shared by the public event page (RLS-gated client, RPC-scoped credits) and the admin
// pending-event preview (service-role client, direct table reads) — same output shape either
// way so the preview is a faithful "what this will look like once published," not a
// hand-maintained second rendering of the same data (I-147).
async function buildEventDetail(
  eventRow: Record<string, unknown>,
  supabase: SupabaseClient,
  creditedPeopleOverride?: Array<SupabaseProfileJoinFlat & { kind: "teacher" | "organizer" }>,
): Promise<EventDetail> {
  const row = eventRow as unknown as SupabaseEventRow & {
    id: string;
    series_id: string | null;
    venue_id: string | null;
    status: string;
    event_series: { title?: string } | { title?: string }[] | null;
  };

  const base = mapEventRow(eventRow as unknown as SupabaseEventRow);

  let seriesSiblings: SeriesSibling[] = [];
  if (row.series_id) {
    const { data: siblingsData } = await supabase
      .from("events")
      .select("id, short_id, title, type, start_date, end_date, series_order")
      .eq("series_id", row.series_id)
      .eq("status", "published")
      .order("series_order", { ascending: true });

    if (siblingsData) {
      seriesSiblings = siblingsData.map((sib) => ({
        id: sib.id,
        shortId: sib.short_id,
        slug: `${sib.short_id}-${slugify(sib.title)}`,
        title: sib.title,
        type: sib.type,
        startDate: sib.start_date,
        endDate: sib.end_date,
        seriesOrder: sib.series_order,
      }));
    }
  }

  // The event's teacher/organizer credit is public historical record (who actually
  // taught/organized it), so the name should still show even for a shadow/deactivated profile
  // — normalizePeople below is what decides whether it's also a clickable link, same gating
  // pattern as venueSlug just below. get_event_credited_people is a SECURITY DEFINER RPC scoped
  // to exactly (kind, role, name, slug, visibility) for credits on publicly-visible events —
  // deliberately not a blanket admin-client/RLS bypass, which would leak the full profile row
  // (bio, city, country, socials...) for a profile that chose to deactivate itself. A pending
  // event isn't publicly-visible yet, so the RPC would return nothing for it — the admin
  // preview path passes creditedPeopleOverride (fetched directly, service-role) instead.
  // No RPC needed here (unlike creditedPeople above) — event_organizers and communities both
  // already have public SELECT policies, and a community row carries no PII to protect.
  const [creditedPeopleResponse, venueResponse, organizingCommunitiesResponse] = await Promise.all([
    creditedPeopleOverride
      ? Promise.resolve({ data: creditedPeopleOverride })
      : supabase.rpc("get_event_credited_people", { p_event_id: row.id }),
    row.venue_id
      ? supabase.from("venues").select("name, address, slug, visibility").eq("id", row.venue_id).single()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("event_organizers")
      .select("community:community_id ( slug, name, type, city, description, deleted_at )")
      .eq("event_id", row.id)
      .not("community_id", "is", null),
  ]);

  const linkItems = normalizeLinkItems(row.links);
  const venueData = venueResponse.data as { name?: string; address?: string; slug?: string; visibility?: string } | null;
  const creditedPeople = (creditedPeopleResponse.data ?? []) as Array<
    SupabaseProfileJoinFlat & { kind: "teacher" | "organizer" }
  >;
  type OrganizingCommunityRowShape = { slug: string; name: string; type: string | null; city: string | null; description: string | null; deleted_at: string | null };
  type OrganizingCommunityRow = { community: OrganizingCommunityRowShape | OrganizingCommunityRowShape[] | null };
  const organizingCommunities = ((organizingCommunitiesResponse.data ?? []) as OrganizingCommunityRow[])
    .map((r) => (Array.isArray(r.community) ? r.community[0] : r.community))
    .filter((c): c is OrganizingCommunityRowShape => Boolean(c) && !c!.deleted_at)
    .map(({ slug, name, type, city, description }) => ({ slug, name, type, city, description }));
  return {
    ...base,
    startTime: row.start_time,
    endTime: row.end_time,
    timezone: row.timezone,
    cancelledText: row.cancelled_text,
    linkItems,
    priceItems: normalizePriceItems(row.price),
    segments: normalizeSegments(row.segments),
    teachers: normalizePeopleFlat(creditedPeople.filter((p) => p.kind === "teacher")),
    organizers: normalizePeopleFlat(creditedPeople.filter((p) => p.kind === "organizer")),
    organizingCommunities,
    hasUnclaimedOrganizer:
      creditedPeople.filter((p) => p.kind === "organizer").length === 0 ||
      creditedPeople.some((p) => p.kind === "organizer" && !p.is_claimed),
    hasNoOrganizer: creditedPeople.filter((p) => p.kind === "organizer").length === 0,
    venueName: venueData?.name ?? row.address?.venue_name ?? null,
    venueAddress: venueData?.address ?? null,
    venueSlug: venueData?.visibility === "public" ? (venueData.slug ?? null) : null,
    hasEmail: Boolean(row.has_email),
    contactEmail: null,
    level: row.level ?? null,
    language: row.language ?? [],
    primaryRegistrationUrl:
      linkItems.find((item) => item.type === "registration")?.url ?? linkItems[0]?.url ?? null,
    startDateIso: `${row.start_date}T${row.start_time ?? "00:00:00"}${getTimezoneOffset(
      row.timezone,
      new Date(`${row.start_date}T${row.start_time ?? "00:00:00"}`),
    )}`,
    endDateIso: `${row.end_date}T${row.end_time ?? "23:59:00"}${getTimezoneOffset(
      row.timezone,
      new Date(`${row.end_date}T${row.end_time ?? "23:59:00"}`),
    )}`,
    seriesName: Array.isArray(row.event_series)
      ? (row.event_series[0] as { title?: string } | null)?.title ?? null
      : (row.event_series as { title?: string } | null)?.title ?? null,
    seriesSiblings,
    imageCredit: row.image_credit ?? null,
    isPast: row.status === "archived",
  };
}

export async function getEventBySlug(shortId: string): Promise<EventDetail | null> {
  if (!hasSupabaseEnv()) {
    return null;
  }

  // events_select_public RLS covers both 'published' and 'archived' (I-112) -- archived
  // (past) events stay publicly readable so their pages keep working for SEO + history,
  // rendered as "ended"; drafts/pending/rejected stay excluded by RLS regardless of query.
  const supabase = await createClient();
  const { data: eventRow } = await supabase
    .from("events")
    .select(EVENT_DETAIL_COLUMNS)
    .ilike("short_id", shortId)
    .maybeSingle();

  if (!eventRow) {
    return null;
  }

  return buildEventDetail(eventRow as unknown as Record<string, unknown>, supabase);
}

// Admin-only: same shape as getEventBySlug, but for a pending/rejected event by id, via the
// service-role client (bypasses RLS — safe here since this is only reachable from
// requireAdminUser()-gated routes). Credited people are fetched directly rather than through
// get_event_credited_people, since that RPC only returns rows for published/archived events —
// see buildEventDetail's comment. Built for the I-147 pending-event preview.
export async function getEventDetailForAdmin(eventId: string): Promise<EventDetail | null> {
  const admin = createAdminClient();

  const { data: eventRow } = await admin
    .from("events")
    .select(EVENT_DETAIL_COLUMNS)
    .eq("id", eventId)
    .maybeSingle();

  if (!eventRow) {
    return null;
  }

  const [teachersRes, organizersRes] = await Promise.all([
    admin.from("event_teachers").select("role, profiles(name, slug, visibility, user_id)").eq("event_id", eventId),
    admin.from("event_organizers").select("role, profiles(name, slug, visibility, user_id)").eq("event_id", eventId),
  ]);

  type CreditRow = { role: string | null; profiles: { name: string; slug: string; visibility: string; user_id: string | null } | null };
  const mapCredit = (kind: "teacher" | "organizer") => (r: CreditRow) => ({
    kind,
    role: r.role,
    name: r.profiles?.name ?? null,
    slug: r.profiles?.slug ?? null,
    visibility: r.profiles?.visibility ?? null,
    is_claimed: Boolean(r.profiles?.user_id),
  });
  const creditedPeople = [
    ...((teachersRes.data ?? []) as unknown as CreditRow[]).map(mapCredit("teacher")),
    ...((organizersRes.data ?? []) as unknown as CreditRow[]).map(mapCredit("organizer")),
  ];

  const detail = await buildEventDetail(
    eventRow as unknown as Record<string, unknown>,
    admin,
    creditedPeople as never,
  );

  // I-165 F3: the I-147 admin preview is the one screen allowed to render the address as
  // plain text, so it is the one caller that reads it back out of entity_emails.
  // buildEventDetail hands every other path contactEmail: null, and those go through the
  // Turnstile-gated reveal instead.
  return { ...detail, contactEmail: await getEntityEmail("event", eventId) };
}

export function parseEventSlug(value: string) {
  const shortId = value.split("-")[0];
  if (!shortId) return null;
  return { shortId };
}

// Canonical event slug from its short_id + title. `getEventBySlug` resolves by the
// short_id prefix, so the title portion is cosmetic — but keep this the single source
// of truth so dashboard/edit links match public links.
export function buildEventSlug(shortId: string, title: string) {
  return `${shortId}-${slugify(title)}`;
}

// All discipline values currently in use, for the organizer submission form's practice
// picker — deliberately checkbox-only (no free text) so the taxonomy only grows through
// admin/addevent-vetted additions, not organizer-invented categories. contact_improvisation
// is always included even if (hypothetically) no event had it, since it's the default.
export async function getKnownDisciplines(): Promise<string[]> {
  try {
    // Regular client, not admin: discipline tags aren't sensitive, only event visibility needs
    // gating, and events_select_public RLS already restricts this to public
    // (hide=false, status published/archived) rows — same condition, no bypass needed.
    const supabase = await createClient();
    const { data } = await supabase.from("events").select("discipline").not("discipline", "is", null);
    const all = new Set<string>(["contact_improvisation"]);
    for (const row of data ?? []) {
      for (const d of (row.discipline as string[] | null) ?? []) all.add(d);
    }
    const rest = Array.from(all)
      .filter((d) => d !== "contact_improvisation")
      .sort((a, b) => disciplineLabel(a).localeCompare(disciplineLabel(b)));
    return ["contact_improvisation", ...rest];
  } catch {
    return ["contact_improvisation"];
  }
}

export function getLevelLabel(level: string): string {
  const labels: Record<string, string> = {
    all_levels: "All levels",
    beginner: "Beginner",
    intermediate: "Intermediate",
    advanced: "Advanced",
    mixed: "Mixed levels",
  };
  return labels[level] ?? level;
}

// Intl.DisplayNames covers the full ISO 639-1 set natively, so a newly-used language code
// (e.g. `vi` before this change) never needs a manual map entry again — it only fell back to
// the raw code before because LANGUAGE_NAMES was hand-maintained and someone has to remember
// to add each one.
const languageDisplayNames = new Intl.DisplayNames(["en"], { type: "language" });

export function getLanguageLabel(code: string): string {
  try {
    const name = languageDisplayNames.of(code);
    return name && name.toLowerCase() !== code.toLowerCase() ? name : code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

export function getLinkLabel(type: string, label?: string) {
  if (label) return label;
  const labels: Record<string, string> = {
    website: "Website",
    email: "Email",
    registration: "Registration",
    info_pack: "Info pack",
    schedule: "Schedule",
    facebook: "Facebook",
    facebook_event: "Facebook event",
    facebook_page: "Facebook Page",
    facebook_group: "Facebook Group",
    video: "Video",
    telegram: "Telegram",
    telegram_group: "Telegram Group",
    telegram_channel: "Telegram Channel",
    whatsapp: "WhatsApp",
    whatsapp_channel: "WhatsApp Channel",
    instagram: "Instagram",
    youtube: "YouTube",
    newsletter: "Newsletter",
    calendar: "Calendar",
    other: "Open link",
    // legacy — kept for any missed renames
    info: "Info pack",
    program: "Schedule",
  };
  return labels[type] ?? "Open link";
}

// Shared by generateMetadata (page <meta> description) and EventDetailView (JSON-LD
// description) — both want plain text, not raw markdown syntax.
export function stripMarkdown(text: string) {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // Replace links [text](url) with 'text'
    .replace(/[#*`_~]/g, "") // Remove basic markdown characters
    .replace(/\n+/g, " ") // Replace newlines with spaces
    .trim();
}

export function formatTimeRange(event: Pick<EventDetail, "startTime" | "endTime" | "timezone">) {
  if (!event.startTime && !event.endTime) {
    return event.timezone;
  }

  const start = event.startTime ? event.startTime.slice(0, 5) : "TBA";
  const end = event.endTime ? event.endTime.slice(0, 5) : "TBA";
  if (event.startTime && event.endTime && event.startTime !== event.endTime) {
    return `Starts ${start} first day · ends ${end} last day (${event.timezone})`;
  }
  return `${start}${event.endTime ? ` - ${end}` : ""} (${event.timezone})`;
}

export function formatPriceLabel(item: PriceItem) {
  if (typeof item.amount !== "number") {
    return item.currency;
  }

  const normalizedAmount = item.amount / 100;
  // Intl.NumberFormat throws on a non-ISO-4217 currency string (found live: "Pound",
  // "pounds" from the self-service form's free-text field, which crashed the whole event
  // page's render, not just the price line) — fall back to a plain "123 CODE" label rather
  // than letting one bad event take down its page.
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency: item.currency,
      maximumFractionDigits: normalizedAmount % 1 === 0 ? 0 : 2,
    }).format(normalizedAmount);
  } catch {
    return `${normalizedAmount} ${item.currency}`;
  }
}

export function getOgImageStyle(type: string) {
  return `${mapAccent(type)} bg-cover bg-center`;
}

export async function getAllPublishedEventSlugs(): Promise<string[]> {
  if (!hasSupabaseEnv()) {
    return [];
  }

  try {
    const supabase = await createClient();
    const today = new Date().toISOString().split("T")[0];
    const { data, error } = await supabase
      .from("events")
      .select("short_id, title")
      .eq("status", "published")
      .gte("end_date", today);

    if (error || !data) {
      return [];
    }

    return data.map((row: { short_id: string; title: string }) =>
      `${row.short_id}-${slugify(row.title)}`
    );
  } catch {
    return [];
  }
}
