"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdminUser } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { addSeriesDates, createSeriesFromEvent, parseDateList, type SeriesType } from "@/lib/series";

// requireAdminUser() only carries the email; the series/event rows record the auth user id.
async function requireAdminUserId(): Promise<string> {
  await requireAdminUser();
  const {
    data: { user },
  } = await (await createClient()).auth.getUser();
  if (!user) throw new Error("Not signed in.");
  return user.id;
}

export type AddDatesState = {
  message: string;
  created: Array<{ shortId: string; startDate: string }>;
  problems: string[];
} | null;

export async function addDatesAction(_prev: AddDatesState, formData: FormData): Promise<AddDatesState> {
  const userId = await requireAdminUserId();
  const seriesId = String(formData.get("seriesId") ?? "");
  const { dates, invalid } = parseDateList(String(formData.get("dates") ?? ""));
  if (!dates.length) {
    return { message: "No valid dates found.", created: [], problems: invalid.map((d) => `${d}: not a date`) };
  }

  const result = await addSeriesDates({
    seriesId,
    dates,
    templateEventId: String(formData.get("templateEventId") ?? "") || null,
    copyTeachers: formData.get("copyTeachers") === "on",
    updatedBy: userId,
  });

  revalidatePath(`/admin/series/${seriesId}`);
  revalidatePath("/admin/series");
  revalidatePath("/admin/events/pending");

  return {
    message: `${result.created.length} ${result.created.length === 1 ? "date" : "dates"} added as pending.`,
    created: result.created.map(({ shortId, startDate }) => ({ shortId, startDate })),
    problems: [
      ...invalid.map((d) => `${d}: not a date`),
      ...result.skipped.map((s) => `${s.date}: ${s.reason}`),
    ],
  };
}

export async function createSeriesAction(formData: FormData) {
  const userId = await requireAdminUserId();
  const shortId = String(formData.get("shortId") ?? "").trim();
  const seriesType = String(formData.get("seriesType") ?? "recurring") as SeriesType;
  if (!shortId) throw new Error("Enter the short ID of an existing event.");

  const { data: event, error } = await createAdminClient()
    .from("events")
    .select("id")
    .eq("short_id", shortId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!event) throw new Error(`No event with short ID ${shortId}.`);

  const seriesId = await createSeriesFromEvent({
    eventId: event.id,
    title: String(formData.get("title") ?? ""),
    seriesType: seriesType === "sequential" ? "sequential" : "recurring",
    createdBy: userId,
  });

  revalidatePath("/admin/series");
  redirect(`/admin/series/${seriesId}`);
}

// One statement on purpose: every date flips together, and the announce series guard
// (_shared/series-guard.ts) posts only the earliest of a batch of identical dates.
export async function publishPendingDatesAction(formData: FormData) {
  await requireAdminUser();
  const seriesId = String(formData.get("seriesId") ?? "");
  if (!seriesId) throw new Error("Missing series id.");
  const { error } = await createAdminClient()
    .from("events")
    .update({ status: "published" })
    .eq("series_id", seriesId)
    .eq("status", "pending");
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/series/${seriesId}`);
  revalidatePath("/admin/events/pending");
  revalidatePath("/");
}
