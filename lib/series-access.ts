// Which series an organizer may add dates to (I-171). Server-only, no "use server": plain helpers
// called from pages and actions that have already resolved the signed-in user.
//
// Same rule as editing a single event (app/events/[eventSlug]/edit/page.tsx): the user submitted
// the event, or their profile is linked to it as an organizer. A series is manageable when that
// holds for at least one of its dates, so an organizer whose first date was added by an admin
// (Jo's "CI on Saturday", 2026-10-14) can still extend it.

import type { SupabaseClient } from "@supabase/supabase-js";

export async function getManageableSeriesIds(
  supabase: SupabaseClient,
  userId: string,
  profileId: string | null,
): Promise<string[]> {
  let orgIds: string[] = [];
  if (profileId) {
    const { data: links } = await supabase
      .from("event_organizers")
      .select("event_id")
      .eq("organizer_id", profileId);
    orgIds = (links ?? []).map((r) => r.event_id as string);
  }
  const filter = orgIds.length ? `user_id.eq.${userId},id.in.(${orgIds.join(",")})` : `user_id.eq.${userId}`;
  const { data: rows } = await supabase
    .from("events")
    .select("series_id")
    .not("series_id", "is", null)
    .or(filter);
  return [...new Set((rows ?? []).map((r) => r.series_id as string))];
}

export async function canManageSeries(
  supabase: SupabaseClient,
  userId: string,
  profileId: string | null,
  seriesId: string,
): Promise<boolean> {
  return (await getManageableSeriesIds(supabase, userId, profileId)).includes(seriesId);
}
