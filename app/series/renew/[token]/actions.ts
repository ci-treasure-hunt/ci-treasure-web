"use server";

import { redirect } from "next/navigation";

import { extendSeries, findSeriesByRenewalToken } from "@/lib/series-renewal";
import { createAdminClient } from "@/lib/supabase/admin";

// I-171 DEC-3b: the two answers on the reminder page. The token in the email is the authorization,
// same as a magic link: it names exactly one series and stops working once the series is extended.
export async function confirmSeriesRenewal(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const info = await findSeriesByRenewalToken(token);
  if (!info) redirect(`/series/renew/${encodeURIComponent(token)}?state=invalid`);

  const result = await extendSeries({ seriesId: info.seriesId, updatedBy: null });
  if (!result.ok) {
    redirect(`/series/renew/${encodeURIComponent(token)}?state=error`);
  }
  // The token was cleared by extendSeries, so the done state is rendered from the query alone.
  const params = new URLSearchParams({
    state: "extended",
    title: info.title,
    until: result.lastNew ?? "",
    live: result.published ? "1" : "0",
  });
  redirect(`/series/renew/done?${params.toString()}`);
}

// "It has stopped": no more reminders for this last date; the dates run out as they would anyway.
export async function declineSeriesRenewal(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const info = await findSeriesByRenewalToken(token);
  if (!info) redirect(`/series/renew/${encodeURIComponent(token)}?state=invalid`);

  await createAdminClient()
    .from("event_series_renewals")
    .update({ token: null, reminder_count: 2, updated_at: new Date().toISOString() })
    .eq("series_id", info.seriesId);
  const params = new URLSearchParams({ state: "stopped", title: info.title, until: info.lastDate ?? "" });
  redirect(`/series/renew/done?${params.toString()}`);
}
