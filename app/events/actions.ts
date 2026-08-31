"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { buildEventSlug } from "@/lib/events";
import { resolveExternalEventImage } from "@/lib/rehost-image";
import { resolveVenueLocation } from "@/lib/geocode";
import {
  BARE_EMAIL,
  normalizeCountry,
  normalizeJsonItems,
  parseCsvArray,
  parseLanguages,
  parseLinkItems,
  parsePriceItems,
  validateOrganizerEvent,
  type OrganizerEventFormData,
} from "@/lib/organizer-events";
import { createClient } from "@/lib/supabase/server";
import tzlookup from "tz-lookup";

type ActionResult = { success: boolean; error?: string; slug?: string; warning?: string };

// Columns written from the organizer form. Status is handled separately so an
// organizer can never set it directly. imageUrl is resolved separately (see
// resolveExternalEventImage, I-126) rather than read straight off data.imageUrl, since a
// pasted external URL needs to be rehosted first.
// timezone is resolved by the caller (auto-derived from lat/lng via tz-lookup when the
// organizer leaves the dropdown blank, see createEvent/updateEvent) rather than read off
// data.timezone directly.
function eventColumns(data: OrganizerEventFormData, imageUrl: string | null, timezone: string) {
  // A bare email typed into a Links URL field ("cicopenhagen@gmail.com" instead of a website)
  // is routed to contact_email instead of stored as a link — found live 2026-08-18, 3 of 4
  // submissions from one organizer did this. `links` renders as a plain, public <a> tag on the
  // event page; contact_email is Turnstile-gated + rate-limited (lib/protected-email-action.ts,
  // email_reveal_log). Storing the email as a link would silently defeat that protection, so it
  // only ever fills contact_email when that field was left blank — never overwrites a real one.
  const bareEmailInLinks = (data.linkItems ?? []).find((i) => BARE_EMAIL.test(i.url.trim()))?.url.trim();
  return {
    title: data.title.trim(),
    type: data.type,
    start_date: data.startDate,
    end_date: data.endDate,
    timezone,
    city: data.city.trim(),
    country: normalizeCountry(data.country),
    description: data.description.trim() || null,
    image_url: imageUrl,
    level: data.level || null,
    language: parseLanguages(data.languages, data.languagesOther),
    features: parseCsvArray(data.features),
    // Real, user-controlled field (checkbox picker, validated non-empty) — safe to share
    // between create and edit, unlike a silent auto-default would be.
    discipline: data.discipline,
    cancelled: data.cancelled,
    cancelled_text: data.cancelled ? data.cancelledText.trim() || "" : null,
    price: normalizeJsonItems(parsePriceItems(data.priceItems ?? [])),
    links: normalizeJsonItems(parseLinkItems(data.linkItems ?? [])),
    contact_email: data.contactEmail.trim() || bareEmailInLinks || null,
    // venue_id/address/lat/lng are resolved by the caller (createEvent/updateEvent) — a
    // linked venue takes its coordinates from the venues table and skips both the free-text
    // address and a redundant geocode.
  };
}

// Auto-derive from the resolved lat/lng (tz-lookup, offline IANA boundary data) when the
// organizer left the dropdown blank — most organizers have no reason to know their own UTC
// offset, and we already geocode every submission for the map pin. Only asks explicitly when
// geocoding itself came up empty (no city/country match at all).
function deriveTimezone(explicit: string, lat: number | undefined, lng: number | undefined): string | null {
  const trimmed = explicit.trim();
  if (trimmed) return trimmed;
  if (lat == null || lng == null) return null;
  try {
    return tzlookup(lat, lng);
  } catch {
    return null;
  }
}

export async function createEvent(data: OrganizerEventFormData): Promise<ActionResult> {
  const validationError = validateOrganizerEvent(data, { enforceMinDuration: true });
  if (validationError) {
    return { success: false, error: validationError };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "You are not signed in." };
  }

  // Must own a profile to submit — this is the organizer link + trust flag.
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, is_trusted")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile) {
    return { success: false, error: "Claim or create your profile before submitting events." };
  }

  const { imageUrl, warning } = await resolveExternalEventImage(data.imageUrl);
  const { venue_id, address, lat, lng } = await resolveVenueLocation(
    supabase,
    data.venueId,
    data.venueName,
    data.city,
    data.country,
  );

  const timezone = deriveTimezone(data.timezone, lat, lng);
  if (!timezone) {
    return {
      success: false,
      error: "We couldn't auto-detect a timezone for this location — please pick one from the Timezone dropdown.",
    };
  }

  // Insert as pending. short_id is filled by the generate_short_id() DB trigger.
  const { data: inserted, error: insertError } = await supabase
    .from("events")
    .insert({
      ...eventColumns(data, imageUrl, timezone),
      venue_id,
      address,
      ...(lat != null && lng != null ? { lat, lng } : {}),
      status: "pending",
      source: "self_submitted",
      user_id: user.id,
      updated_by: user.id,
    })
    .select("id, short_id, title")
    .single();
  if (insertError || !inserted) {
    return { success: false, error: insertError?.message ?? "Could not create event." };
  }

  // Link the organizer's profile as lead (roles are always 'lead').
  const { error: linkError } = await supabase.from("event_organizers").insert({
    event_id: inserted.id,
    organizer_id: profile.id,
    role: "lead",
  });
  if (linkError) {
    // Non-fatal: event exists and is in the admin queue; admin can fix the link.
    console.error("event_organizers link failed:", linkError.message);
  }

  // Teachers picked in the create form (InlineTeacherPicker) — can only be written now,
  // since event_teachers needs the real id this insert just produced. Non-fatal for the
  // same reason as the organizer link above: the event already exists either way.
  let teacherWarning: string | undefined;
  if (data.teachers?.length) {
    const { error: teacherError } = await supabase.from("event_teachers").insert(
      data.teachers.map((t) => ({ event_id: inserted.id, teacher_id: t.profileId, role: t.role })),
    );
    if (teacherError) {
      console.error("event_teachers link failed:", teacherError.message);
      teacherWarning = "Event created, but teachers couldn't be linked — add them from the edit page.";
    }
  }

  // Trusted organizers auto-publish. The announce Edge Function fires on the
  // pending→published UPDATE (not on INSERT), so publish via a follow-up update.
  if (profile.is_trusted) {
    const admin = createAdminClient();
    await admin.from("events").update({ status: "published" }).eq("id", inserted.id);
    revalidatePath("/");
  } else {
    notifyAdminNewEvent(inserted.title).catch(() => {});
  }

  revalidatePath("/dashboard");
  return { success: true, slug: buildEventSlug(inserted.short_id, inserted.title), warning: teacherWarning ?? warning };
}

export async function updateEvent(
  eventId: string,
  data: OrganizerEventFormData,
): Promise<ActionResult> {
  const validationError = validateOrganizerEvent(data);
  if (validationError) {
    return { success: false, error: validationError };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "You are not signed in." };
  }

  const { imageUrl, warning } = await resolveExternalEventImage(data.imageUrl);

  const { data: current } = await supabase
    .from("events")
    .select("lat, lng, venue_id")
    .eq("id", eventId)
    .maybeSingle();
  const { venue_id, address, lat, lng } = await resolveVenueLocation(
    supabase,
    data.venueId,
    data.venueName,
    data.city,
    data.country,
    current,
  );

  const timezone = deriveTimezone(data.timezone, lat ?? undefined, lng ?? undefined);
  if (!timezone) {
    return {
      success: false,
      error: "We couldn't auto-detect a timezone for this location — please pick one from the Timezone dropdown.",
    };
  }

  // RLS (events_update) enforces that the user owns or is linked to this event.
  // Status is intentionally not touched — published stays published.
  const { data: updated, error } = await supabase
    .from("events")
    .update({
      ...eventColumns(data, imageUrl, timezone),
      venue_id,
      address,
      ...(lat != null && lng != null ? { lat, lng } : {}),
      updated_by: user.id,
    })
    .eq("id", eventId)
    .select("id, short_id, title")
    .maybeSingle();

  if (error) {
    return { success: false, error: error.message };
  }
  if (!updated) {
    return { success: false, error: "You don't have permission to edit this event." };
  }

  revalidatePath("/dashboard");
  // Cached ISR pages (homepage list, this event's own detail page) won't
  // otherwise pick up an organizer edit for up to an hour — revalidate both
  // immediately, same as the admin edit API route.
  revalidatePath("/");
  revalidatePath(`/events/${buildEventSlug(updated.short_id, updated.title)}`);
  return { success: true, slug: buildEventSlug(updated.short_id, updated.title), warning };
}

// Admin group topic for pending-event submissions (env-overridable).
const EVENT_THREAD_ID = Number(process.env.TELEGRAM_EVENT_THREAD_ID ?? 685);

// No submitter email here by design, same reasoning as the claims and report notifiers: a nudge
// to go look, not a record of who did what. Keeps account holders' email addresses out of
// Telegram entirely (I-159) — the review page shows who submitted it.
async function notifyAdminNewEvent(title: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!token || !chatId) return;

  const text = [
    `🆕 New event submitted: ${title}`,
    `Review: https://citreasurehunt.com/admin/events/pending`,
  ].join("\n");

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      message_thread_id: EVENT_THREAD_ID,
      text,
      link_preview_options: { is_disabled: true },
    }),
  });
}

// I-166 F3: notifyAdminTeacherAdded moved to lib/notify.ts. It was exported from this module,
// which carries "use server", and every export in such a module is a callable endpoint whose
// caller's authorization does not protect it. It is server-only, so it now lives in a plain
// module where it cannot become one by accident.
