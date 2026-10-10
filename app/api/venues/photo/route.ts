import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { removeImageSet, resizeAndUploadImage } from "@/lib/upload-action";
import { verifyVenuePhotoTicket } from "@/lib/venue-photo-ticket";

// I-181: the optional photo on /venues/new, sent right after the submission (server actions can't
// carry the file). A Route Handler like the other upload paths, for the body size.
//
// Only with the ticket submitVenue() just handed out, and only onto a venue that has no page and
// no photo yet. A Pin's photo is seen by nobody until an admin gives the venue a page, which is the
// review; a venue that already has a page never gets a photo this way.

const clip = (v: FormDataEntryValue | null, max: number) => String(v ?? "").trim().slice(0, max);

function fail(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

export async function POST(request: NextRequest) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail("The upload could not be read. The photo may be too large.");
  }

  const venueId = clip(form.get("venueId"), 64);
  const file = form.get("file");
  const credit = clip(form.get("credit"), 200);
  const consent = form.get("consent") === "true";
  const ticket = clip(form.get("ticket"), 200);

  if (!/^[0-9a-f-]{36}$/i.test(venueId)) return fail("Unknown venue.");
  if (!(file instanceof File) || file.size === 0) return fail("Please choose a photo.");
  if (!consent) return fail("Please confirm you may share this photo.");
  if (!verifyVenuePhotoTicket(venueId, ticket)) return fail("This upload link has expired.", 403);

  const supabase = createAdminClient();
  const { data: venue } = await supabase
    .from("venues")
    .select("id, visibility, image_url")
    .eq("id", venueId)
    .maybeSingle();
  if (!venue) return fail("This venue can't be found.", 404);
  if (venue.visibility === "public" || venue.image_url) return fail("This venue already has a photo.", 409);

  let imageUrl: string;
  try {
    imageUrl = await resizeAndUploadImage(file, "venue-images");
  } catch (error) {
    return fail(error instanceof Error ? error.message : "The photo could not be processed.");
  }

  const { error } = await supabase
    .from("venues")
    .update({
      image_url: imageUrl,
      image_credit: credit ? (/^photo by /i.test(credit) ? credit : `Photo by ${credit}`) : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", venue.id)
    .is("image_url", null);
  if (error) {
    await removeImageSet(imageUrl, "venue-images");
    return fail("Something went wrong saving your photo. Please try again.", 500);
  }

  return NextResponse.json({ ok: true });
}
