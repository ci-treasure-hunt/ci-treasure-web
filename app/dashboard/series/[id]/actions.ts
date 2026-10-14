"use server";

import { revalidatePath } from "next/cache";

import { TEACHER_ROLE_OPTIONS } from "@/lib/admin-events";
import { ISO_DATE, addDays } from "@/lib/date-list";
import { buildEventSlug } from "@/lib/events";
import { notifyAdminSeriesDatesAdded } from "@/lib/notify";
import { REPEAT_HORIZON_DAYS, REPEAT_MAX_DATES } from "@/lib/organizer-events";
import { addSeriesDates } from "@/lib/series";
import { canManageSeries } from "@/lib/series-access";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type OrganizerAddDatesInput = {
  seriesId: string;
  dates: string[];
  // "same": copy the teachers of the latest date. "pick": the teachers listed here (may be empty).
  teacherMode: "same" | "pick";
  teachers: Array<{ profileId: string; role: string }>;
  title: string;
};

export type OrganizerAddDatesResult = {
  success: boolean;
  error?: string;
  published?: boolean;
  created?: Array<{ slug: string; startDate: string }>;
  skipped?: Array<{ date: string; reason: string }>;
};

// I-171: an organizer extends their own series. Same limits as "Does this repeat?" on the event
// form (REPEAT_MAX_DATES per submission, REPEAT_HORIZON_DAYS ahead), and the same publish rule as
// createEvent: trusted organizers publish at once, everyone else lands in the pending queue as one
// series card.
export async function addOrganizerSeriesDates(input: OrganizerAddDatesInput): Promise<OrganizerAddDatesResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "You are not signed in." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, is_trusted")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!(await canManageSeries(supabase, user.id, profile?.id ?? null, input.seriesId))) {
    return { success: false, error: "You can only add dates to a series you organize." };
  }

  const today = new Date().toISOString().slice(0, 10);
  const horizon = addDays(today, REPEAT_HORIZON_DAYS);
  const dates = [...new Set(input.dates.map((d) => d.trim()).filter(Boolean))].sort();
  if (!dates.length) return { success: false, error: "Add at least one date." };
  if (dates.length > REPEAT_MAX_DATES) {
    return { success: false, error: `Add up to ${REPEAT_MAX_DATES} dates at a time.` };
  }
  for (const date of dates) {
    if (!ISO_DATE.test(date)) return { success: false, error: `${date} is not a date.` };
    if (date < today) return { success: false, error: `${date} is in the past.` };
    if (date > horizon) {
      return { success: false, error: `${date} is more than six months ahead. Add it closer to the time.` };
    }
  }

  // Explicit teachers go in with the admin client below, so check they are real profiles and
  // real roles here rather than trusting the browser's ids.
  let teachers: Array<{ teacher_id: string; role: string }> | undefined;
  if (input.teacherMode === "pick") {
    const picked = input.teachers.filter(
      (t, i, all) => all.findIndex((o) => o.profileId === t.profileId) === i,
    );
    if (picked.some((t) => !(TEACHER_ROLE_OPTIONS as readonly string[]).includes(t.role))) {
      return { success: false, error: "Unknown teacher role." };
    }
    if (picked.length) {
      const { data: found } = await createAdminClient()
        .from("profiles")
        .select("id")
        .in("id", picked.map((t) => t.profileId));
      if ((found ?? []).length !== picked.length) return { success: false, error: "A picked teacher was not found." };
    }
    teachers = picked.map((t) => ({ teacher_id: t.profileId, role: t.role }));
  }

  let result;
  try {
    result = await addSeriesDates({
      seriesId: input.seriesId,
      dates,
      copyTeachers: input.teacherMode === "same",
      teachers,
      title: input.title.trim().slice(0, 200) || undefined,
      updatedBy: user.id,
      source: "self_submitted",
    });
  } catch (error) {
    console.error("organizer add series dates failed:", error instanceof Error ? error.message : error);
    return { success: false, error: "The dates could not be added. Email hello@citreasurehunt.com and we will add them." };
  }

  const admin = createAdminClient();
  const createdIds = result.created.map((c) => c.id);
  const published = Boolean(profile?.is_trusted) && createdIds.length > 0;
  if (published) {
    // One update for all dates, same as createEvent: the announce series guard then posts only
    // dates whose title or teachers differ from what was already announced.
    await admin.from("events").update({ status: "published" }).in("id", createdIds);
    revalidatePath("/");
  } else if (createdIds.length) {
    const { data: series } = await admin.from("event_series").select("title").eq("id", input.seriesId).maybeSingle();
    notifyAdminSeriesDatesAdded(series?.title ?? "series", createdIds.length).catch(() => {});
  }

  const { data: rows } = createdIds.length
    ? await admin.from("events").select("short_id, title, start_date").in("id", createdIds).order("start_date")
    : { data: [] };

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/series/${input.seriesId}`);
  revalidatePath("/admin/events/pending");
  return {
    success: true,
    published,
    created: (rows ?? []).map((r) => ({ slug: buildEventSlug(r.short_id, r.title), startDate: r.start_date })),
    skipped: result.skipped,
  };
}
