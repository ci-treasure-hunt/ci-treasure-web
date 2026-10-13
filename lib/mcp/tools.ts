// I-141 Stage A: the public, read-only MCP server's tools. Mounted at app/api/mcp/route.ts.
//
// Every tool is a thin wrapper over the same lib/ fetchers the public pages use, so visibility
// rules (published/archived only, hide=false, public profiles/venues, live communities) come from
// those functions and from RLS, never re-derived here. Rules of this layer, from the I-141 spec:
//   - no contact data: no emails, phone numbers or community invite links (those stay behind the
//     Turnstile reveal on the site, and later behind Stage B's signed-in tools);
//   - every link points at citreasurehunt.com with UTM tags, never at an organizer's own
//     registration URL, so agent-driven visits are countable (I-173);
//   - small capped result sets and no unfiltered bulk listing (I-127's scraping stance).
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { COUNTRIES } from "@/lib/countries";
import { getCommunities, getCommunityBySlug, getCommunityOwnEvents } from "@/lib/communities";
import { disciplineLabel, getCountryLabel, getEventHref, getTypeLabel } from "@/lib/event-display";
import type { EventListItem } from "@/lib/event-display";
import {
  formatPriceLabel,
  formatTimeRange,
  getEventBySlug,
  getLanguageLabel,
  getLevelLabel,
  getUpcomingEvents,
  parseEventSlug,
} from "@/lib/events";
import { SITE_URL } from "@/lib/site";
import { deriveRoles, getListedPeople, getTeacherBySlug, getTeacherEvents } from "@/lib/teachers";
import { getVenueBySlug, getVenueEvents, getVenues } from "@/lib/venues";

const MAX_RESULTS = 20;
const DEFAULT_RESULTS = 10;
const MAX_DESCRIPTION = 3000;
// Upcoming events listed inside a teacher/venue/community detail.
const MAX_NESTED_EVENTS = 10;

const EVENT_TYPES = [
  "festival",
  "workshop",
  "intensive",
  "retreat",
  "long_jam",
  "training",
  "residency",
  "camp",
  "jam",
  "class",
] as const;

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

// ---------- helpers ----------

function siteUrl(path: string): string {
  const url = new URL(path, SITE_URL);
  url.searchParams.set("utm_source", "mcp");
  url.searchParams.set("utm_medium", "agent");
  return url.toString();
}

function today(): string {
  return new Date().toISOString().split("T")[0];
}

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").trim().toLowerCase();

// Accepts an ISO code ("PT") or an English name in either spelling the site uses ("Portugal",
// "Czech Republic"/"Czechia", "Turkey"/"Türkiye"). Returns null when nothing matches, so the
// tool can say so instead of silently returning everything.
function resolveCountry(input: string): string | null {
  const trimmed = input.trim();
  if (/^[a-z]{2}$/i.test(trimmed)) {
    const code = trimmed.toUpperCase();
    return COUNTRIES.some((c) => c.code === code) ? code : null;
  }
  const wanted = fold(trimmed);
  const hit = COUNTRIES.find((c) => fold(c.name) === wanted || fold(getCountryLabel(c.code)) === wanted);
  return hit?.code ?? null;
}

function matchesText(query: string | undefined, ...fields: Array<string | null | undefined>): boolean {
  if (!query) return true;
  const terms = fold(query).split(/\s+/).filter(Boolean);
  const haystack = fold(fields.filter(Boolean).join(" "));
  return terms.every((t) => haystack.includes(t));
}

function truncate(text: string | null, max = MAX_DESCRIPTION): string | null {
  if (!text) return null;
  return text.length <= max ? text : `${text.slice(0, max).trimEnd()}… (truncated, full text on the page)`;
}

function json(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

function notFound(what: string, hint: string) {
  return toolError(`No public ${what} found. ${hint}`);
}

function toolError(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true };
}

function unknownCountry(country: string) {
  return toolError(`"${country}" is not a country we recognise. Try an ISO code like "PT" or the English name.`);
}

function eventSummary(e: EventListItem) {
  return {
    id: e.shortId,
    title: e.title,
    type: getTypeLabel(e.type),
    startDate: e.startDate,
    endDate: e.endDate,
    city: e.city,
    country: getCountryLabel(e.country),
    practices: e.discipline.map(disciplineLabel),
    cancelled: e.cancelled || undefined,
    url: siteUrl(getEventHref(e)),
  };
}

const limitSchema = z
  .number()
  .int()
  .min(1)
  .max(MAX_RESULTS)
  .optional()
  .describe(`Maximum results, 1 to ${MAX_RESULTS}. Default ${DEFAULT_RESULTS}.`);

// ---------- server ----------

export const MCP_INSTRUCTIONS = `CI Treasure Hunt (citreasurehunt.com) is a worldwide directory of Contact Improvisation (CI) events, teachers, venues and local communities.

- Contact Improvisation is the default. search_events returns CI events unless you pass a different practice or practice="any". Some listed events are related practices (conscious dance, Axis Syllabus, butoh and others), tagged under "practices".
- Event types: festival (multi-day gathering), workshop (a teacher-led course, often a weekend), intensive (several full days of training), retreat (residential, often rural), long_jam (extended open practice), training (multi-module professional training), jam and class (regular local sessions; few are listed yet).
- Dates are ISO (YYYY-MM-DD). Prices are only in get_event.
- Always give the user the citreasurehunt.com URL from the results. Registration links and organizer contact details are on those pages, not in this API.
- Local weekly jams and classes are usually run by communities: use search_communities for "where can I dance CI in <city>".`;

export function registerCiTreasureHuntTools(server: McpServer) {
  server.registerTool(
    "search_events",
    {
      title: "Search events",
      description:
        "Search upcoming Contact Improvisation events (festivals, workshops, intensives, retreats, long jams) worldwide. Returns up to 20 matches sorted by start date, each with a citreasurehunt.com URL. Use get_event for prices, teachers and full details.",
      inputSchema: z.object({
        country: z.string().optional().describe('Country as ISO code ("PT") or English name ("Portugal").'),
        city: z.string().optional().describe("City name, e.g. Berlin."),
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Earliest date, YYYY-MM-DD. Default today."),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Latest start date, YYYY-MM-DD."),
        type: z.enum(EVENT_TYPES).optional().describe("Event type."),
        practice: z
          .string()
          .optional()
          .describe('Practice tag, e.g. "contact_improvisation" (default), "conscious_dance", "axis_syllabus", or "any" for all practices.'),
        query: z.string().optional().describe("Free text matched against title, description and place, e.g. a teacher's name or 'silent'."),
        limit: limitSchema,
      }),
      annotations: READ_ONLY,
    },
    async ({ country, city, from, to, type, practice, query, limit }) => {
      const { events, error } = await getUpcomingEvents(today());
      if (error) return toolError(error);

      let countryCode: string | null = null;
      if (country) {
        countryCode = resolveCountry(country);
        if (!countryCode) return unknownCountry(country);
      }
      const practiceTag = practice ? practice.trim().toLowerCase().replace(/[\s-]+/g, "_") : "contact_improvisation";
      const start = from ?? today();

      const matches = events.filter(
        (e) =>
          e.endDate >= start &&
          (!to || e.startDate <= to) &&
          (!countryCode || e.country === countryCode) &&
          (!city || fold(e.city) === fold(city)) &&
          (!type || e.type === type) &&
          (practiceTag === "any" || e.discipline.includes(practiceTag)) &&
          matchesText(query, e.title, e.description, e.city, getCountryLabel(e.country)),
      );

      const max = limit ?? DEFAULT_RESULTS;
      return json({
        totalMatches: matches.length,
        showing: Math.min(matches.length, max),
        events: matches.slice(0, max).map(eventSummary),
        ...(matches.length === 0 && {
          hint: "Nothing matched. Try widening the dates, dropping the city, or practice=\"any\".",
        }),
      });
    },
  );

  server.registerTool(
    "get_event",
    {
      title: "Get event details",
      description:
        "Full public details of one event: dates and times, place, description, prices, teachers, organizers, level and languages. Accepts the event id from search_events (e.g. 'W27r') or a citreasurehunt.com event URL.",
      inputSchema: z.object({
        id: z.string().min(2).describe("Event id (e.g. 'W27r'), its slug, or its citreasurehunt.com URL."),
      }),
      annotations: READ_ONLY,
    },
    async ({ id }) => {
      const lastSegment = id.trim().replace(/[?#].*$/, "").replace(/\/+$/, "").split("/").pop() ?? "";
      const shortId = parseEventSlug(lastSegment)?.shortId;
      const event = shortId ? await getEventBySlug(shortId) : null;
      if (!event) return notFound("event", "Check the id, or find it with search_events.");

      // Roles: the site shows none except "musician"-style distinctions on teachers, and never
      // organizer roles ("lead" is internal bookkeeping), so the API follows suit.
      const credit = (p: { name: string; role?: string | null; slug?: string | null }, showRole: boolean) => ({
        name: p.name,
        ...(showRole && p.role && p.role !== "teacher" && { role: p.role }),
        ...(p.slug && { url: siteUrl(`/teachers/${p.slug}`) }),
      });

      return json({
        id: event.shortId,
        title: event.title,
        type: getTypeLabel(event.type),
        status: event.cancelled ? "cancelled" : event.isPast ? "ended" : "upcoming",
        ...(event.cancelledText && { cancellationNote: event.cancelledText }),
        startDate: event.startDate,
        endDate: event.endDate,
        times: event.startTime || event.endTime ? formatTimeRange(event) : null,
        timezone: event.timezone,
        city: event.city,
        country: getCountryLabel(event.country),
        venue: event.venueName
          ? {
              name: event.venueName,
              ...(event.venueAddress && { address: event.venueAddress }),
              ...(event.venueSlug && { url: siteUrl(`/venues/${event.venueSlug}`) }),
            }
          : null,
        practices: event.discipline.map(disciplineLabel),
        level: event.level ? getLevelLabel(event.level) : null,
        languages: event.language.map(getLanguageLabel),
        prices: event.priceItems.map((p) => ({
          price: formatPriceLabel(p),
          ...(p.description && { description: p.description }),
        })),
        teachers: event.teachers.map((p) => credit(p, true)),
        organizers: event.organizers.map((p) => credit(p, false)),
        organizingCommunities: event.organizingCommunities.map((c) => ({
          name: c.name,
          url: siteUrl(`/communities/${c.slug}`),
        })),
        ...(event.seriesName && { series: event.seriesName }),
        description: truncate(event.description),
        registration: event.primaryRegistrationUrl
          ? "Registration and contact details are linked on the event page."
          : "No registration link listed; see the event page for contact options.",
        url: siteUrl(getEventHref(event)),
      });
    },
  );

  server.registerTool(
    "search_teachers",
    {
      title: "Search teachers",
      description:
        "Search Contact Improvisation teachers, organizers and musicians listed on citreasurehunt.com, by name, country or city. Returns short profiles with URLs; use get_teacher for the bio and upcoming events.",
      inputSchema: z.object({
        query: z.string().optional().describe("Name or words from their bio."),
        country: z.string().optional().describe('Where they are based, ISO code or English name.'),
        city: z.string().optional().describe("City they are based in."),
        role: z.enum(["teacher", "organizer", "musician"]).optional(),
        limit: limitSchema,
      }),
      annotations: READ_ONLY,
    },
    async ({ query, country, city, role, limit }) => {
      if (!query && !country && !city) {
        return toolError("Give at least a name, country or city.");
      }
      let countryCode: string | null = null;
      if (country) {
        countryCode = resolveCountry(country);
        if (!countryCode) return unknownCountry(country);
      }
      const people = await getListedPeople();
      const matches = people.filter(
        (p) =>
          (!countryCode || p.country === countryCode) &&
          (!city || (p.city && fold(p.city) === fold(city))) &&
          (!role || p.roles.includes(role)) &&
          matchesText(query, p.name, p.bioSnippet),
      );
      const max = limit ?? DEFAULT_RESULTS;
      return json({
        totalMatches: matches.length,
        showing: Math.min(matches.length, max),
        people: matches.slice(0, max).map((p) => ({
          name: p.name,
          slug: p.slug,
          roles: p.roles,
          basedIn: p.isNomadic ? "nomadic" : [p.city, p.countryLabel].filter(Boolean).join(", ") || null,
          bio: p.bioSnippet,
          url: siteUrl(`/teachers/${p.slug}`),
        })),
      });
    },
  );

  server.registerTool(
    "get_teacher",
    {
      title: "Get teacher profile",
      description: "A teacher's, organizer's or musician's public profile: bio, where they are based, practices, and their upcoming events.",
      inputSchema: z.object({
        slug: z.string().min(1).describe("Profile slug from search_teachers, e.g. 'mona-ring'."),
      }),
      annotations: READ_ONLY,
    },
    async ({ slug }) => {
      const profile = await getTeacherBySlug(slug.trim().toLowerCase());
      if (!profile) return notFound("profile", "Find the slug with search_teachers.");

      const { upcoming, past } = await getTeacherEvents(profile.id);
      const all = [...upcoming, ...past];
      const roles = deriveRoles(profile, {
        hasTeacherCredit: all.some((e) => e.teacher_id && e.role !== "musician"),
        hasMusicianCredit: all.some((e) => e.role === "musician"),
        hasOrganizerCredit: all.some((e) => e.organizer_id),
      });

      return json({
        name: profile.name,
        roles: [roles.isTeacher && "teacher", roles.isOrganizer && "organizer", roles.isMusician && "musician"].filter(Boolean),
        basedIn: profile.is_nomadic
          ? "nomadic"
          : [profile.city, profile.country ? getCountryLabel(profile.country) : null].filter(Boolean).join(", ") || null,
        practices: (profile.discipline ?? []).map(disciplineLabel),
        practicingSince: profile.year_starting_practice,
        teachingSince: profile.year_starting_teaching,
        bio: truncate(profile.bio),
        website: profile.website,
        upcomingEvents: upcoming.slice(0, MAX_NESTED_EVENTS).map(eventSummary),
        pastEventCount: past.length,
        url: siteUrl(`/teachers/${profile.slug}`),
      });
    },
  );

  server.registerTool(
    "search_venues",
    {
      title: "Search venues",
      description: "Search dance studios and retreat centers that host Contact Improvisation events, by name, country or city.",
      inputSchema: z.object({
        query: z.string().optional().describe("Venue name or words from its description."),
        country: z.string().optional().describe("ISO code or English name."),
        city: z.string().optional(),
        limit: limitSchema,
      }),
      annotations: READ_ONLY,
    },
    async ({ query, country, city, limit }) => {
      if (!query && !country && !city) {
        return toolError("Give at least a name, country or city.");
      }
      let countryCode: string | null = null;
      if (country) {
        countryCode = resolveCountry(country);
        if (!countryCode) return unknownCountry(country);
      }
      const { venues, error } = await getVenues();
      if (error) return toolError(error);
      const matches = venues.filter(
        (v) =>
          (!countryCode || v.countryIso === countryCode) &&
          (!city || fold(v.city) === fold(city)) &&
          matchesText(query, v.name, v.description, v.city),
      );
      const max = limit ?? DEFAULT_RESULTS;
      return json({
        totalMatches: matches.length,
        showing: Math.min(matches.length, max),
        venues: matches.slice(0, max).map((v) => ({
          name: v.name,
          slug: v.slug,
          city: v.city,
          country: v.country,
          description: truncate(v.description, 300),
          url: siteUrl(`/venues/${v.slug}`),
        })),
      });
    },
  );

  server.registerTool(
    "get_venue",
    {
      title: "Get venue details",
      description: "A venue's public details (address, description, website) and its upcoming events.",
      inputSchema: z.object({
        slug: z.string().min(1).describe("Venue slug from search_venues."),
      }),
      annotations: READ_ONLY,
    },
    async ({ slug }) => {
      const venue = await getVenueBySlug(slug.trim().toLowerCase());
      if (!venue) return notFound("venue", "Find the slug with search_venues.");
      const { upcoming, past } = await getVenueEvents(venue.id);
      return json({
        name: venue.name,
        city: venue.city,
        country: getCountryLabel(venue.country),
        address: venue.address,
        description: truncate(venue.description),
        website: venue.website,
        upcomingEvents: upcoming.slice(0, MAX_NESTED_EVENTS).map(eventSummary),
        pastEventCount: past.length,
        url: siteUrl(`/venues/${venue.slug}`),
      });
    },
  );

  server.registerTool(
    "search_communities",
    {
      title: "Search communities",
      description:
        "Search local Contact Improvisation communities, the groups that run regular jams and classes, by country or city. The best answer to 'where can I dance CI in <city>'.",
      inputSchema: z.object({
        country: z.string().optional().describe("ISO code or English name."),
        city: z.string().optional(),
        query: z.string().optional().describe("Community name or words from its description."),
        limit: limitSchema,
      }),
      annotations: READ_ONLY,
    },
    async ({ country, city, query, limit }) => {
      if (!query && !country && !city) {
        return toolError("Give at least a country, city or name.");
      }
      let countryCode: string | null = null;
      if (country) {
        countryCode = resolveCountry(country);
        if (!countryCode) return unknownCountry(country);
      }
      const { communities, error } = await getCommunities();
      if (error) return toolError(error);
      const matches = communities.filter(
        (c) =>
          (!countryCode || c.countryIso === countryCode) &&
          (!city || fold(c.city) === fold(city)) &&
          matchesText(query, c.name, c.description, c.city),
      );
      const max = limit ?? DEFAULT_RESULTS;
      return json({
        totalMatches: matches.length,
        showing: Math.min(matches.length, max),
        communities: matches.slice(0, max).map((c) => ({
          name: c.name,
          slug: c.slug,
          city: c.city || null,
          country: c.country,
          description: truncate(c.description, 300),
          url: siteUrl(`/communities/${c.slug}`),
        })),
      });
    },
  );

  server.registerTool(
    "get_community",
    {
      title: "Get community details",
      description:
        "A local community's public details: what it runs, where, languages, and events it organizes. Group chat invite links and contacts are on the community's page, not here.",
      inputSchema: z.object({
        slug: z.string().min(1).describe("Community slug from search_communities."),
      }),
      annotations: READ_ONLY,
    },
    async ({ slug }) => {
      const community = await getCommunityBySlug(slug.trim().toLowerCase());
      if (!community) return notFound("community", "Find the slug with search_communities.");
      const ownEvents = await getCommunityOwnEvents(community.id);
      return json({
        name: community.name,
        type: community.type,
        city: community.city,
        country: community.country ? getCountryLabel(community.country) : null,
        description: truncate(community.description),
        focus: community.focus,
        activityLevel: community.activity_level,
        languages: (community.languages ?? []).map(getLanguageLabel),
        website: community.website,
        hasGroupChat: community.has_invites || undefined,
        upcomingEvents: ownEvents.slice(0, MAX_NESTED_EVENTS).map(eventSummary),
        people: community.associatedPeople.slice(0, MAX_NESTED_EVENTS).map((p) => ({
          name: p.name,
          url: siteUrl(`/teachers/${p.slug}`),
        })),
        venues: community.associatedVenues.map((v) => ({ name: v.name, url: siteUrl(`/venues/${v.slug}`) })),
        url: siteUrl(`/communities/${community.slug}`),
      });
    },
  );
}
