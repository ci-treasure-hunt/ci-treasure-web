import { slugify } from "@/lib/slug";
import { createAdminClient } from "@/lib/supabase/admin";

// I-181: the one place venue rows are matched and created outside the admin's own forms.
//
// Two callers: the event forms, where a place name plus a street address that geocodes to a
// building becomes a no-page venue (a "Pin") automatically, and the signed-in /venues/new form.
// Both land as visibility 'hidden' and off the /venues list; a page and the list stay a manual
// call in /admin/venues (website rule, see the addvenue skill). Server-only: service-role client.

export type VenueSource = "addvenue" | "admin" | "event_form" | "venue_form";

// Close enough to be the same building. Two studios in one complex sit closer than this, which is
// why a match by distance also needs the names to agree (see namesMatch).
const SAME_PLACE_METRES = 120;

/** Lowercase, no accents, no punctuation, no filler words a name may or may not carry. */
function normalizeName(name: string): string {
  return slugify(name)
    .split("-")
    .filter((w) => w && !["the", "studio", "studios", "space", "der", "die", "das", "el", "la", "le"].includes(w))
    .join(" ");
}

/** "Villa Wigman" and "Villa Wigman Dresden" agree; "Uferstudio 14" and "Uferstudio 5" do not. */
export function namesMatch(a: string, b: string): boolean {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.length >= 4 && (` ${long} `.includes(` ${short} `));
}

function metresBetween(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

export type MatchedVenue = {
  id: string;
  name: string;
  slug: string;
  visibility: string;
  lat: number | null;
  lng: number | null;
};

/**
 * An existing venue that is the same place: same name in the same city, or a matching name
 * within ~120 m. Never distance alone, so a second studio in the same building isn't swallowed.
 */
export async function findMatchingVenue(place: {
  name: string;
  city: string;
  country: string;
  lat: number | null;
  lng: number | null;
}): Promise<MatchedVenue | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("venues")
    .select("id, name, slug, visibility, lat, lng, city")
    .eq("country", place.country.trim().toUpperCase());
  const rows = (data ?? []) as Array<MatchedVenue & { city: string | null }>;

  const sameCity = (row: { city: string | null }) =>
    (row.city ?? "").trim().toLowerCase() === place.city.trim().toLowerCase();
  const near = (row: MatchedVenue) =>
    place.lat != null &&
    place.lng != null &&
    row.lat != null &&
    row.lng != null &&
    metresBetween(place.lat, place.lng, row.lat, row.lng) <= SAME_PLACE_METRES;

  const hit = rows.find((row) => namesMatch(row.name, place.name) && (sameCity(row) || near(row)));
  return hit ? { id: hit.id, name: hit.name, slug: hit.slug, visibility: hit.visibility, lat: hit.lat, lng: hit.lng } : null;
}

export async function createUniqueVenueSlug(baseSlug: string): Promise<string> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("venues").select("slug").ilike("slug", `${baseSlug}%`);
  if (error) throw error;

  const existing = new Set((data ?? []).map((row) => String(row.slug).toLowerCase()));
  if (!existing.has(baseSlug)) return baseSlug;

  let suffix = 2;
  while (existing.has(`${baseSlug}-${suffix}`)) suffix += 1;
  return `${baseSlug}-${suffix}`;
}

export type NewVenueFields = {
  name: string;
  address: string;
  city: string;
  country: string;
  lat: number;
  lng: number;
  website?: string | null;
  instagram?: string | null;
  facebook?: string | null;
  description?: string | null;
};

/** Always a Pin: hidden, off the list. Returns the new row. */
export async function createPinVenue(
  fields: NewVenueFields,
  source: VenueSource,
  createdBy: string | null,
): Promise<MatchedVenue> {
  const supabase = createAdminClient();
  const slug = await createUniqueVenueSlug(slugify(`${fields.name} ${fields.city}`) || "venue");
  const { data, error } = await supabase
    .from("venues")
    .insert({
      name: fields.name,
      slug,
      address: fields.address,
      city: fields.city,
      country: fields.country.toUpperCase(),
      lat: fields.lat,
      lng: fields.lng,
      website: fields.website || null,
      instagram: fields.instagram || null,
      facebook: fields.facebook || null,
      description: fields.description || null,
      visibility: "hidden",
      show_in_list: false,
      source,
      created_by: createdBy,
    })
    .select("id, name, slug, visibility, lat, lng")
    .single();
  if (error) throw error;
  return data as MatchedVenue;
}

/** Admin ping for a venue that didn't come from an admin. Name and place only (I-159). */
export async function notifyNewVenue(venue: { name: string; city: string; country: string }, source: VenueSource) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  const threadId = process.env.TELEGRAM_REPORT_THREAD_ID;
  if (!token || !chatId) return;

  const text = [
    source === "venue_form" ? "📍 New venue submitted" : "📍 New venue from an event",
    `${venue.name} · ${venue.city}, ${venue.country}`,
    "→ https://citreasurehunt.com/admin/venues?new=1",
  ].join("\n");

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        message_thread_id: threadId ? Number(threadId) : undefined,
        text,
        link_preview_options: { is_disabled: true },
      }),
    });
  } catch {
    // A failed ping must not fail the save; the admin "new" filter still shows it.
  }
}
