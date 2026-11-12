// I-171 Stage 5, DEC-3b (2026-11-12): extending an open-ended series by six months. Server-only
// (admin client), no "use server": called from the renewal page, the organizer dashboard and admin.
//
// An open-ended series ("It keeps going, no end date") carries event_series.recurrence_rule. Nothing
// extends it automatically. The owner confirms (email link, dashboard button) or an admin does, and
// only then do the next six months of dates get created. Unconfirmed, the dates run out and the
// nightly archive job ends the listing like any one-off event. The reminder emails are sent by the
// edge function series-renewal-reminders; its state lives in event_series_renewals (deny-all,
// because event_series itself is publicly readable).

import { revalidatePath } from "next/cache";

import { addDays } from "@/lib/date-list";
import { REPEAT_HORIZON_DAYS, REPEAT_MAX_DATES, recurrenceStepDays } from "@/lib/organizer-events";
import { addSeriesDates } from "@/lib/series";
import { createAdminClient } from "@/lib/supabase/admin";

export type SeriesRenewalInfo = {
  seriesId: string;
  title: string;
  stepDays: number;
  // Start date of the series' last date (not rejected). Null if every date was rejected.
  lastDate: string | null;
};

export type ExtendSeriesResult =
  | { ok: true; created: number; published: boolean; firstNew: string | null; lastNew: string | null }
  | { ok: false; error: string };

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

// Null when the series has no rule we can generate from (a finite series, or an admin-made one).
export async function getSeriesRenewalInfo(seriesId: string): Promise<SeriesRenewalInfo | null> {
  const supabase = createAdminClient();
  const { data: series } = await supabase
    .from("event_series")
    .select("id, title, recurrence_rule")
    .eq("id", seriesId)
    .maybeSingle();
  const stepDays = recurrenceStepDays(series?.recurrence_rule);
  if (!series || !stepDays) return null;

  const { data: last } = await supabase
    .from("events")
    .select("start_date")
    .eq("series_id", seriesId)
    .neq("status", "rejected")
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  return { seriesId: series.id, title: series.title, stepDays, lastDate: last?.start_date ?? null };
}

// The dates a renewal adds: continuing the pattern after the last date, from today on (a series
// that already lapsed picks up again on the next date in its rhythm), up to the six-month horizon.
export function nextRenewalDates(lastDate: string, stepDays: number, today = todayIso()): string[] {
  const horizon = addDays(today, REPEAT_HORIZON_DAYS);
  let next = addDays(lastDate, stepDays);
  while (next < today) next = addDays(next, stepDays);
  const dates: string[] = [];
  while (next <= horizon && dates.length < REPEAT_MAX_DATES) {
    dates.push(next);
    next = addDays(next, stepDays);
  }
  return dates;
}

// Adds the next six months. New dates copy the latest date (teachers, organizers, contacts) and go
// live at once when the series was already reviewed (any date published or archived); a series
// that never got past review keeps them pending. Resets the reminder state either way.
export async function extendSeries(opts: { seriesId: string; updatedBy: string | null }): Promise<ExtendSeriesResult> {
  const info = await getSeriesRenewalInfo(opts.seriesId);
  if (!info) return { ok: false, error: "This series has no repeating pattern to continue." };
  if (!info.lastDate) return { ok: false, error: "This series has no date to continue from." };

  const dates = nextRenewalDates(info.lastDate, info.stepDays);
  if (!dates.length) return { ok: false, error: "This series already has dates for the next six months." };

  const supabase = createAdminClient();
  const result = await addSeriesDates({
    seriesId: info.seriesId,
    dates,
    copyTeachers: true,
    updatedBy: opts.updatedBy,
    source: "series_renewal",
  });
  const createdIds = result.created.map((c) => c.id);

  const { count: reviewed } = await supabase
    .from("events")
    .select("id", { count: "exact", head: true })
    .eq("series_id", info.seriesId)
    .in("status", ["published", "archived"]);
  const published = Boolean(reviewed) && createdIds.length > 0;
  if (published) {
    // One update for all dates: the announce series guard posts nothing for dates identical to
    // what was already announced (_shared/series-guard.ts).
    await supabase.from("events").update({ status: "published" }).in("id", createdIds);
  }

  await supabase.from("event_series_renewals").upsert({
    series_id: info.seriesId,
    token: null,
    reminder_count: 0,
    reminded_at: null,
    last_date: null,
    updated_at: new Date().toISOString(),
  });

  revalidatePath("/");
  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/series/${info.seriesId}`);
  revalidatePath(`/admin/series/${info.seriesId}`);

  const created = result.created.map((c) => c.startDate).sort();
  return {
    ok: true,
    created: created.length,
    published,
    firstNew: created[0] ?? null,
    lastNew: created[created.length - 1] ?? null,
  };
}

// The series a reminder link points at, or null for an unknown or already-used token.
export async function findSeriesByRenewalToken(token: string): Promise<SeriesRenewalInfo | null> {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return null;
  const { data } = await createAdminClient()
    .from("event_series_renewals")
    .select("series_id")
    .eq("token", token)
    .maybeSingle();
  return data ? getSeriesRenewalInfo(data.series_id) : null;
}
