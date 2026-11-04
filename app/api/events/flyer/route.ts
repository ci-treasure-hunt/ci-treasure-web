import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";

import { verifyEventFlyerTicket } from "@/lib/event-submit-ticket";
import { createAdminClient } from "@/lib/supabase/admin";
import { removeImageSet, resizeAndUploadImage } from "@/lib/upload-action";

// I-192 stage 3: the optional flyer from step 1 of adding an event, sent right after the save
// (server actions can't carry the file), with the ticket submitEventStep1 just handed out. Works
// signed out too: the ticket is the proof. Only onto an event without an image yet, and onto every
// date of a repeating event created by the same submission.
//
// Publishing: when a trusted organizer adds a flyer, submitEventStep1 holds the event back
// (deferPublish) and it is published here, after the image is on it. The Telegram announcement
// fires on publish and can't gain a photo afterwards (a text message can't become a photo post),
// so the order matters. If the upload fails, the event simply stays in the review queue.

const clip = (v: FormDataEntryValue | null, max: number) => String(v ?? "").trim().slice(0, max);

function fail(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

export async function POST(request: NextRequest) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail("The upload could not be read. The image may be too large.");
  }

  const eventId = clip(form.get("eventId"), 64);
  const ticket = clip(form.get("ticket"), 200);
  const file = form.get("file");
  if (!verifyEventFlyerTicket(eventId, ticket)) return fail("This upload link has expired.", 403);
  if (!(file instanceof File) || file.size === 0) return fail("Please choose an image.");

  const admin = createAdminClient();
  const { data: event } = await admin
    .from("events")
    .select("id, image_url, series_id, status, user_id")
    .eq("id", eventId)
    .maybeSingle();
  if (!event) return fail("This event can't be found.", 404);
  if (event.image_url) return fail("This event already has an image.", 409);

  let imageUrl: string;
  try {
    imageUrl = await resizeAndUploadImage(file, "event-images");
  } catch (error) {
    return fail(error instanceof Error ? error.message : "The image could not be processed.");
  }

  let ids = [event.id as string];
  if (event.series_id) {
    const { data: siblings } = await admin
      .from("events")
      .select("id")
      .eq("series_id", event.series_id)
      .is("image_url", null)
      .in("status", ["pending", "published"]);
    ids = [...new Set([event.id as string, ...(siblings ?? []).map((r) => r.id as string)])];
  }
  const { error } = await admin.from("events").update({ image_url: imageUrl }).in("id", ids).is("image_url", null);
  if (error) {
    await removeImageSet(imageUrl, "event-images");
    return fail("Something went wrong saving the image. Please try again.", 500);
  }

  // The held-back publish for a trusted organizer (see the comment at the top).
  if (event.status === "pending" && event.user_id) {
    const { data: submission } = await admin
      .from("event_submissions")
      .select("roles")
      .eq("event_id", event.id)
      .maybeSingle();
    const { data: owner } = await admin
      .from("profiles")
      .select("is_trusted")
      .eq("user_id", event.user_id)
      .maybeSingle();
    if ((submission?.roles as string[] | undefined)?.includes("organizer") && owner?.is_trusted) {
      await admin.from("events").update({ status: "published" }).in("id", ids).eq("status", "pending");
      revalidatePath("/");
    }
  }

  return NextResponse.json({ ok: true });
}
