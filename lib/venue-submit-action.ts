"use server";

// I-181: /venues/new, for signed-in users. A venue (studio, retreat centre, dance house) that
// isn't listed yet, typically one with no event with us so far.
//
// Account required, not Turnstile: we want to know whom to ask, and it is the natural basis if
// venue claiming ever comes (Phase 3). Venue submitters are organizers and space holders, who have
// accounts or get one with one click. Capped per user per day instead of per IP.
//
// Lands as a Pin (hidden, off the list) via lib/venue-records.ts, exactly like a venue created from
// the event form. A page and the /venues list stay a manual call in /admin/venues. If the place is
// already known, nothing new is created: a Pin gets its empty fields filled in, a venue with a page
// is left alone and the submitter is pointed to it.

import { setEntityEmail } from "@/lib/entity-email";
import { geocodeEventLocation } from "@/lib/geocode";
import { normalizePlaceCase } from "@/lib/place-case";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { safeExternalUrl } from "@/lib/url-safety";
import { createVenuePhotoTicket } from "@/lib/venue-photo-ticket";
import { createPinVenue, findMatchingVenue, notifyNewVenue } from "@/lib/venue-records";

const PER_USER_PER_DAY = 5;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type VenueSubmitInput = {
  name: string;
  address: string;
  city: string;
  country: string;
  website: string;
  instagram: string;
  facebook: string;
  description: string;
  email: string;
  /** "I run this space, or I've checked it's fine to list it." Required. */
  consent: boolean;
};

export type VenueSubmitResult =
  | {
      ok: true;
      /** "created": new Pin. "updated": an existing Pin got missing details. "listed": already has a page. */
      outcome: "created" | "updated" | "listed";
      venueName: string;
      /** Public page, only when there is one. */
      venueSlug: string | null;
      /** For /api/venues/photo. Null when the venue already has a page: photos there go via email. */
      venueId: string | null;
      photoTicket: string | null;
    }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

const clip = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

export async function submitVenue(input: VenueSubmitInput): Promise<VenueSubmitResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in to add a venue." };

  const admin = createAdminClient();
  const { count } = await admin
    .from("venues")
    .select("id", { count: "exact", head: true })
    .eq("created_by", user.id)
    .gte("created_at", new Date(Date.now() - 86400_000).toISOString());
  if ((count ?? 0) >= PER_USER_PER_DAY) {
    return { ok: false, error: "You've added several venues today. Please try again tomorrow." };
  }

  // ---- Validate ---------------------------------------------------------------------------------
  const name = clip(input.name, 150);
  const address = clip(input.address, 300);
  // "freiburg" -> "Freiburg": places are shown in standard capitalization (lib/place-case.ts).
  const city = normalizePlaceCase(clip(input.city, 120));
  const country = clip(input.country, 2).toUpperCase();
  const description = clip(input.description, 2000);
  const email = clip(input.email, 200);

  const fieldErrors: Record<string, string> = {};
  if (!name) fieldErrors.name = "Please give the venue's name.";
  if (!address) fieldErrors.address = "Please give the street address.";
  if (!city) fieldErrors.city = "Please give the city.";
  if (!/^[A-Z]{2}$/.test(country)) fieldErrors.country = "Please pick a country.";
  if (email && !EMAIL_RE.test(email)) fieldErrors.email = "This doesn't look like an email address.";
  if (!input.consent) fieldErrors.consent = "Please confirm that this venue may be listed.";

  const links: Record<"website" | "instagram" | "facebook", string | null> = {
    website: null,
    instagram: null,
    facebook: null,
  };
  for (const key of ["website", "instagram", "facebook"] as const) {
    const raw = clip(input[key], 500);
    if (!raw) continue;
    const safe = safeExternalUrl(raw);
    if (!safe) fieldErrors[key] = "This doesn't look like a web address.";
    else links[key] = safe;
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, error: "Please check the highlighted fields.", fieldErrors };
  }

  // A map pin is required for a venue. An address that only resolves to the city still gets one
  // (the city centre); the admin corrects it when looking at the new venue.
  const coords = await geocodeEventLocation(name, address, city, country);
  if (!coords) {
    return {
      ok: false,
      error: "We couldn't find this place on the map. Please check the city and country.",
      fieldErrors: { city: "Not found on the map." },
    };
  }

  // ---- Already known? ---------------------------------------------------------------------------
  const existing = await findMatchingVenue({ name, city, country, lat: coords.lat, lng: coords.lng });
  if (existing && existing.visibility === "public") {
    return { ok: true, outcome: "listed", venueName: existing.name, venueSlug: existing.slug, venueId: null, photoTicket: null };
  }
  if (existing) {
    // A Pin: fill in what it lacks, never overwrite what's there.
    const { data: row } = await admin
      .from("venues")
      .select("website, instagram, facebook, description")
      .eq("id", existing.id)
      .single();
    const current = (row ?? {}) as Record<string, string | null>;
    const patch: Record<string, string> = {};
    for (const [key, value] of Object.entries({ ...links, description: description || null })) {
      if (value && !current[key]) patch[key] = value;
    }
    if (Object.keys(patch).length > 0) {
      await admin.from("venues").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", existing.id);
    }
    if (email) await fillEmailIfMissing(existing.id, email);
    await notifyNewVenue({ name: existing.name, city, country }, "venue_form");
    return {
      ok: true,
      outcome: "updated",
      venueName: existing.name,
      venueSlug: null,
      venueId: existing.id,
      photoTicket: createVenuePhotoTicket(existing.id),
    };
  }

  // ---- New Pin ------------------------------------------------------------------------------------
  let venue;
  try {
    venue = await createPinVenue(
      { name, address, city, country, lat: coords.lat, lng: coords.lng, ...links, description: description || null },
      "venue_form",
      user.id,
    );
  } catch {
    return { ok: false, error: "Something went wrong saving the venue. Please try again." };
  }
  if (email) await setEntityEmail("venue", venue.id, email);
  await notifyNewVenue({ name, city, country }, "venue_form");

  return {
    ok: true,
    outcome: "created",
    venueName: name,
    venueSlug: null,
    venueId: venue.id,
    photoTicket: createVenuePhotoTicket(venue.id),
  };
}

async function fillEmailIfMissing(venueId: string, email: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("entity_emails")
    .select("email")
    .eq("entity_type", "venue")
    .eq("entity_id", venueId)
    .maybeSingle();
  if (!data) await setEntityEmail("venue", venueId, email);
}
