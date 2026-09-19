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

import { setEntityEmail } from "@/lib/entity-email";
import { uniqueProfileSlug } from "@/lib/profile-slug";
type ActionResult = { success: boolean; error?: string; slug?: string; warning?: string };

// Columns written from the organizer form. Status is handled separately so an
// organizer can never set it directly. imageUrl is resolved separately (see
// resolveExternalEventImage, I-126) rather than read straight off data.imageUrl, since a
// pasted external URL needs to be rehosted first.
// timezone is resolved by the caller (auto-derived from lat/lng via tz-lookup when the
// organizer leaves the dropdown blank, see createEvent/updateEvent) rather than read off
// data.timezone directly.
// A bare email typed into a Links URL field ("cicopenhagen@gmail.com" instead of a website)
// is routed to the protected email store instead of stored as a link — found live 2026-08-18, 3 of 4
// submissions from one organizer did this. `links` renders as a plain, public <a> tag on the
// event page; the address is Turnstile-gated + rate-limited (lib/protected-email-action.ts,
// email_reveal_log). Storing the email as a link would silently defeat that protection, so it
// only ever fills the address when that field was left blank — never overwrites a real one.
//
// I-165 F3: resolved separately from eventColumns, because the address no longer lives on the
// events row. It goes to entity_emails via setEntityEmail once the row id is known.
function resolveContactEmail(data: OrganizerEventFormData): string | null {
  const bareEmailInLinks = (data.linkItems ?? []).find((i) => BARE_EMAIL.test(i.url.trim()))?.url.trim();
  return data.contactEmail.trim() || bareEmailInLinks || null;
}

function eventColumns(data: OrganizerEventFormData, imageUrl: string | null, timezone: string) {
  return {
    title: data.title.trim(),
    type: data.type,
    start_date: data.startDate,
    end_date: data.endDate,
    start_time: data.startTime.trim() || null,
    end_time: data.endTime.trim() || null,
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

  // I-165 F3. Ownership is already established: this row was just inserted under this user's
  // session and RLS.
  await setEntityEmail("event", inserted.id, resolveContactEmail(data));

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

  // Teachers picked in the create form (PersonPicker) — can only be written now, since
  // event_teachers needs the real id this insert just produced. Non-fatal for the same reason
  // as the organizer link above: the event already exists either way.
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

  // Additional organizers picked in the create form, added 2026-09-19 alongside the same
  // PersonPicker teachers use. Filter out the submitter's own profile: they're already linked
  // above, and event_organizers has a UNIQUE(event_id, organizer_id) that a re-add would trip.
  // Always 'lead' regardless of whatever role the item carries (co-organizer is not a role this
  // form offers, see OrganizerEventFormData's comment on `organizers`).
  let organizerWarning: string | undefined;
  const extraOrganizers = (data.organizers ?? []).filter((o) => o.profileId !== profile.id);
  if (extraOrganizers.length) {
    const { error: organizerError } = await supabase.from("event_organizers").insert(
      extraOrganizers.map((o) => ({ event_id: inserted.id, organizer_id: o.profileId, role: "lead" })),
    );
    if (organizerError) {
      console.error("event_organizers extra link failed:", organizerError.message);
      organizerWarning = "Event created, but the extra organizers couldn't be linked — add them from the edit page.";
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
  return {
    success: true,
    slug: buildEventSlug(inserted.short_id, inserted.title),
    warning: teacherWarning ?? organizerWarning ?? warning,
  };
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

  // I-165 F3. Only reached when the RLS-guarded update above actually matched a row, so the
  // caller's permission to edit this event is already proven.
  await setEntityEmail("event", updated.id, resolveContactEmail(data));

  revalidatePath("/dashboard");
  // Cached ISR pages (homepage list, this event's own detail page) won't
  // otherwise pick up an organizer edit for up to an hour — revalidate both
  // immediately, same as the admin edit API route.
  revalidatePath("/");
  revalidatePath(`/events/${buildEventSlug(updated.short_id, updated.title)}`);
  return { success: true, slug: buildEventSlug(updated.short_id, updated.title), warning };
}

export type SimilarProfileMatch = { id: string; name: string; bioSnippet: string | null };

// Dedup guard for suggestPersonProfile, added 2026-09-19 after shipping it without one — an
// organizer's search can miss a real match (typo, nickname, maiden name) and the picker only
// offers "suggest new" once search comes back empty, so without this a near-duplicate stub was
// one typo away. Mirrors checkSimilarProfiles in app/dashboard/new-profile/actions.ts exactly,
// including the same security reasoning: search_similar_profiles is SECURITY DEFINER and can
// see shadow profiles a normal session can't, so this only runs signed in.
export async function checkSimilarProfileNames(name: string): Promise<SimilarProfileMatch[]> {
  if (name.trim().length < 3) return [];

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase.rpc("search_similar_profiles", { p_name: name.trim() });

  return (data ?? []).map((p: { id: string; name: string; bio_snippet: string | null }) => ({
    id: p.id,
    name: p.name,
    bioSnippet: p.bio_snippet,
  }));
}

// Organizers drafting an event can suggest a teacher or co-organizer who isn't listed yet,
// instead of only getting a "contact us" dead end (found live 2026-09-19: the picker offered no
// way to add someone real). Creates a name-only stub for admin enrichment, same shape as the
// self-submitted profile flow but with no account behind it — there is no consenting person to
// hand editing to, so it stays admin-only until someone fills in a bio/photo and approves it.
// Deliberately thin: no bio, no photo, no socials — an organizer speaking for someone else
// shouldn't be the one writing their bio (same reasoning as "no profile portraits").
export async function suggestPersonProfile(
  name: string,
  kind: "teacher" | "organizer",
): Promise<{ success: boolean; profileId?: string; error?: string }> {
  const trimmed = name.trim();
  if (!trimmed) {
    return { success: false, error: "Name is required." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "You are not signed in." };
  }

  const admin = createAdminClient();

  // Best-effort breadcrumb for enrichment ("who suggested this, in case it needs a follow-up
  // question") — never blocks on it, a stub is still useful with no traceability.
  const { data: submitter } = await admin
    .from("profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  const slug = await uniqueProfileSlug(admin, trimmed);
  const { data: inserted, error } = await admin
    .from("profiles")
    .insert({
      name: trimmed,
      slug,
      is_teacher: kind === "teacher",
      is_organizer: kind === "organizer",
      source: "organizer_submitted",
      source_id: submitter?.id ?? null,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    return { success: false, error: error?.message ?? "Could not create profile." };
  }

  notifyAdminNewPersonSuggestion(trimmed, kind).catch(() => {});

  return { success: true, profileId: inserted.id };
}

// Same admin topic as new-profile notifications (dashboard/new-profile/actions.ts) — both land
// in the same /admin/profiles/pending queue. No personal data (I-159): the submitter isn't named.
async function notifyAdminNewPersonSuggestion(name: string, kind: "teacher" | "organizer") {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!token || !chatId) return;

  const threadId = process.env.TELEGRAM_PROFILE_THREAD_ID
    ? Number(process.env.TELEGRAM_PROFILE_THREAD_ID)
    : undefined;

  const text = [
    `An organizer suggested a ${kind} who isn't listed yet: "${name}".`,
    "Review: https://citreasurehunt.com/admin/profiles/pending",
  ].join("\n");

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      ...(threadId ? { message_thread_id: threadId } : {}),
      text,
      link_preview_options: { is_disabled: true },
    }),
  });
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
