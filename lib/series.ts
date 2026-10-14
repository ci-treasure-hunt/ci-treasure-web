// I-171 Stage 1: series occurrence generation, admin side. Server-only (admin client).
//
// D-01/D-03 (docs/issues/archive/decisions.md): every occurrence is its own `events` row, and the
// series row carries the defaults new occurrences copy. This module turns "these dates" into those
// rows. Explicit date lists only for now: real CI schedules are irregular (RhMW ran Sep 26, Oct 3,
// then roughly monthly), so the date list is the part that has to exist anyway. RRULE expansion and
// a rolling horizon can feed the same addSeriesDates() later.
//
// Field precedence for a new occurrence: series default (when set) > the template occurrence. The
// template (the latest existing occurrence, unless one is picked) supplies what the series has no
// default for: title, description, image, segments, coordinates, owner, organizers and, optionally,
// teachers. Every new row lands as `pending`, so nothing goes public or gets announced until an
// admin publishes it from the pending queue.

import { createAdminClient } from "@/lib/supabase/admin";
import { getEntityEmail, setEntityEmail } from "@/lib/entity-email";
import { getEntityPhoneContacts, setEntityPhoneContacts } from "@/lib/entity-phone-contacts";
import { ISO_DATE, addDays, daysBetween } from "@/lib/date-list";

export { parseDateList } from "@/lib/date-list";

export type SeriesType = "recurring" | "sequential";

export type SeriesListItem = {
  id: string;
  title: string;
  seriesType: SeriesType;
  total: number;
  upcoming: number;
  nextDate: string | null;
};

export type SeriesInstance = {
  id: string;
  shortId: string;
  title: string;
  startDate: string;
  endDate: string;
  status: string;
  seriesOrder: number | null;
  teachers: string[];
};

export type SeriesDetail = {
  id: string;
  title: string;
  seriesType: SeriesType;
  description: string | null;
  defaults: Record<string, unknown>;
  instances: SeriesInstance[];
};

export type AddDatesResult = {
  created: Array<{ id: string; shortId: string; startDate: string }>;
  skipped: Array<{ date: string; reason: string }>;
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export async function listSeries(): Promise<SeriesListItem[]> {
  const supabase = createAdminClient();
  const [{ data: series, error }, { data: events, error: eventsError }] = await Promise.all([
    supabase.from("event_series").select("id, title, series_type").order("title"),
    supabase.from("events").select("series_id, start_date, end_date, status").not("series_id", "is", null),
  ]);
  if (error) throw new Error(error.message);
  if (eventsError) throw new Error(eventsError.message);

  const today = todayIso();
  return (series ?? []).map((s) => {
    const mine = (events ?? []).filter((e) => e.series_id === s.id);
    const upcoming = mine
      .filter((e) => e.end_date >= today && e.status !== "rejected")
      .map((e) => e.start_date as string)
      .sort();
    return {
      id: s.id,
      title: s.title,
      seriesType: s.series_type as SeriesType,
      total: mine.length,
      upcoming: upcoming.length,
      nextDate: upcoming[0] ?? null,
    };
  });
}

export async function getSeriesDetail(seriesId: string): Promise<SeriesDetail | null> {
  const supabase = createAdminClient();
  const { data: series, error } = await supabase.from("event_series").select("*").eq("id", seriesId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!series) return null;

  const { data: events, error: eventsError } = await supabase
    .from("events")
    .select("id, short_id, title, start_date, end_date, status, series_order, event_teachers(profiles(name))")
    .eq("series_id", seriesId)
    .order("start_date");
  if (eventsError) throw new Error(eventsError.message);

  const defaults = Object.fromEntries(
    Object.entries(series).filter(([key, value]) => key.startsWith("default_") && value !== null),
  );

  type Row = {
    id: string;
    short_id: string;
    title: string;
    start_date: string;
    end_date: string;
    status: string;
    series_order: number | null;
    event_teachers: Array<{ profiles: { name: string } | Array<{ name: string }> | null }> | null;
  };
  return {
    id: series.id,
    title: series.title,
    seriesType: series.series_type,
    description: series.description,
    defaults,
    instances: ((events ?? []) as unknown as Row[]).map((e) => ({
      id: e.id,
      shortId: e.short_id,
      title: e.title,
      startDate: e.start_date,
      endDate: e.end_date,
      status: e.status,
      seriesOrder: e.series_order,
      teachers: (e.event_teachers ?? [])
        .map((t) => (Array.isArray(t.profiles) ? t.profiles[0]?.name : t.profiles?.name))
        .filter((n): n is string => Boolean(n)),
    })),
  };
}

// Turns an existing event into the first occurrence of a new series, with the series defaults
// taken from it. The usual way a series starts: an event is already listed, then turns out to
// repeat.
export async function createSeriesFromEvent(opts: {
  eventId: string;
  title: string;
  seriesType: SeriesType;
  createdBy: string;
}): Promise<string> {
  const supabase = createAdminClient();
  const { data: event, error } = await supabase.from("events").select("*").eq("id", opts.eventId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!event) throw new Error("Event not found.");
  if (event.series_id) throw new Error("That event already belongs to a series.");

  const { data: series, error: seriesError } = await supabase
    .from("event_series")
    .insert({
      title: opts.title.trim() || event.title,
      series_type: opts.seriesType,
      description: null,
      default_type: event.type,
      default_timezone: event.timezone,
      default_start_time: event.start_time,
      default_end_time: event.end_time,
      default_venue_id: event.venue_id,
      default_address: event.address,
      default_city: event.city,
      default_country: event.country,
      default_region: event.region,
      default_discipline: event.discipline,
      default_language: event.language,
      default_level: event.level,
      default_features: event.features,
      default_links: event.links,
      default_price: event.price,
      created_by: opts.createdBy,
    })
    .select("id")
    .single();
  if (seriesError) throw new Error(seriesError.message);

  // D-02 / DEC-6b: recurring instances are interchangeable, so no position (NULL); sequential
  // parts are numbered.
  const { error: linkError } = await supabase
    .from("events")
    .update({ series_id: series.id, series_order: opts.seriesType === "sequential" ? 1 : null })
    .eq("id", event.id);
  if (linkError) throw new Error(linkError.message);

  return series.id;
}

type SegmentJson = { start_date?: string; end_date?: string; teachers?: string[]; [key: string]: unknown };

// Segment dates move with the occurrence; segment teacher names go when the teachers aren't
// carried over (a guest-teacher series names someone different every time).
function adaptSegments(segments: unknown, offsetDays: number, keepTeachers: boolean) {
  if (!segments || typeof segments !== "object" || !Array.isArray((segments as { items?: unknown }).items)) {
    return segments ?? null;
  }
  const items = ((segments as { items: SegmentJson[] }).items).map((item) => {
    const next: SegmentJson = { ...item };
    if (typeof next.start_date === "string") next.start_date = addDays(next.start_date, offsetDays);
    if (typeof next.end_date === "string") next.end_date = addDays(next.end_date, offsetDays);
    if (!keepTeachers) delete next.teachers;
    return next;
  });
  return { ...(segments as object), items };
}

export async function addSeriesDates(opts: {
  seriesId: string;
  dates: string[];
  templateEventId?: string | null;
  copyTeachers: boolean;
  updatedBy: string;
  // events.source for the new rows: "series" from the admin form, "self_submitted" when an
  // organizer's own submission generates them (I-171 Stage 4).
  source?: string;
}): Promise<AddDatesResult> {
  const supabase = createAdminClient();
  const result: AddDatesResult = { created: [], skipped: [] };

  const { data: series, error } = await supabase.from("event_series").select("*").eq("id", opts.seriesId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!series) throw new Error("Series not found.");

  const { data: instances, error: instancesError } = await supabase
    .from("events")
    .select("*")
    .eq("series_id", opts.seriesId)
    .order("start_date");
  if (instancesError) throw new Error(instancesError.message);
  if (!instances?.length) throw new Error("This series has no occurrence yet to copy from.");

  const template =
    (opts.templateEventId && instances.find((e) => e.id === opts.templateEventId)) ||
    instances[instances.length - 1];
  const spanDays = daysBetween(template.start_date, template.end_date);
  const existingStarts = new Set(instances.map((e) => e.start_date as string));
  let nextOrder = Math.max(0, ...instances.map((e) => (e.series_order as number | null) ?? 0)) + 1;

  const [{ data: organizers }, { data: teachers }, contactEmail, phoneContacts] = await Promise.all([
    supabase.from("event_organizers").select("organizer_id, community_id, role").eq("event_id", template.id),
    supabase.from("event_teachers").select("teacher_id, role").eq("event_id", template.id),
    getEntityEmail("event", template.id),
    getEntityPhoneContacts("event", template.id),
  ]);

  const pick = <T,>(seriesDefault: T | null | undefined, fromTemplate: T) =>
    seriesDefault !== null && seriesDefault !== undefined ? seriesDefault : fromTemplate;

  for (const date of opts.dates) {
    if (!ISO_DATE.test(date)) {
      result.skipped.push({ date, reason: "not a date" });
      continue;
    }
    if (date < todayIso()) {
      result.skipped.push({ date, reason: "in the past" });
      continue;
    }
    if (existingStarts.has(date)) {
      result.skipped.push({ date, reason: "series already has this date" });
      continue;
    }

    const offset = daysBetween(template.start_date, date);
    const { data: created, error: insertError } = await supabase
      .from("events")
      .insert({
        series_id: series.id,
        series_order: series.series_type === "sequential" ? nextOrder : null,
        status: "pending",
        // Rotating guest teachers (copyTeachers off): the template's title and description name the
        // previous guest ("CI on Saturday with Alexa Papa & ..."), so start from the series' own
        // title/description instead and let the admin fill in this date's guest before publishing.
        title: opts.copyTeachers ? template.title : series.title,
        description: opts.copyTeachers ? template.description : series.description ?? template.description,
        image_url: template.image_url,
        image_credit: template.image_credit,
        segments: adaptSegments(template.segments, offset, opts.copyTeachers),
        start_date: date,
        end_date: addDays(date, spanDays),
        type: pick(series.default_type, template.type),
        timezone: pick(series.default_timezone, template.timezone),
        start_time: pick(series.default_start_time, template.start_time),
        end_time: pick(series.default_end_time, template.end_time),
        venue_id: pick(series.default_venue_id, template.venue_id),
        address: pick(series.default_address, template.address),
        city: pick(series.default_city, template.city),
        country: pick(series.default_country, template.country),
        region: pick(series.default_region, template.region),
        lat: template.lat,
        lng: template.lng,
        discipline: pick(series.default_discipline, template.discipline),
        language: pick(series.default_language, template.language),
        level: pick(series.default_level, template.level),
        features: pick(series.default_features, template.features),
        links: pick(series.default_links, template.links),
        price: pick(series.default_price, template.price),
        accommodation_type: template.accommodation_type,
        capacity: template.capacity,
        user_id: template.user_id,
        source: opts.source ?? "series",
        updated_by: opts.updatedBy,
      })
      .select("id, short_id")
      .single();
    if (insertError) {
      result.skipped.push({ date, reason: insertError.message });
      continue;
    }

    if (organizers?.length) {
      const { error: orgError } = await supabase
        .from("event_organizers")
        .insert(organizers.map((o) => ({ ...o, event_id: created.id })));
      if (orgError) throw new Error(orgError.message);
    }
    if (opts.copyTeachers && teachers?.length) {
      const { error: teacherError } = await supabase
        .from("event_teachers")
        .insert(teachers.map((t) => ({ ...t, event_id: created.id })));
      if (teacherError) throw new Error(teacherError.message);
    }
    if (contactEmail) await setEntityEmail("event", created.id, contactEmail);
    if (phoneContacts.length) await setEntityPhoneContacts("event", created.id, phoneContacts, "admin");

    existingStarts.add(date);
    if (series.series_type === "sequential") nextOrder++;
    result.created.push({ id: created.id, shortId: created.short_id, startDate: date });
  }

  return result;
}
