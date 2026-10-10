import { createPinVenue, findMatchingVenue, notifyNewVenue, type VenueSource } from "@/lib/venue-records";

// Server-side geocoding for event/venue addresses typed into admin/organizer forms —
// same source (OpenStreetMap Nominatim, free, no key) as the addvenue skill's manual
// lookup. Never called from the client: Nominatim's usage policy wants a descriptive
// User-Agent and courteous request volume, both easier to guarantee server-side.
const NOMINATIM_USER_AGENT = "CITreasureHunt/1.0 (https://citreasurehunt.com)";
const TIMEOUT_MS = 8_000;

export async function geocodeAddress(query: string): Promise<{ lat: number; lng: number } | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(trimmed)}&format=json&limit=1`,
      {
        headers: { "User-Agent": NOMINATIM_USER_AGENT },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );
    if (!response.ok) return null;
    const results = (await response.json()) as Array<{ lat?: string; lon?: string }>;
    const first = results[0];
    if (!first?.lat || !first?.lon) return null;

    const lat = Number.parseFloat(first.lat);
    const lng = Number.parseFloat(first.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}

/**
 * Geocode an event's location: the street address first, then the venue name, then a
 * city-level approximation (same fallback the addvenue skill uses manually). Never blocks the
 * caller, just returns null on total failure.
 *
 * The address and the name are tried separately on purpose (I-181). Nominatim finds
 * "Bispebjerg Torv 1, 2400 København" but not "Dansekapellet. Bispebjerg Torv 1, 2400 Kbh NV,
 * Copenhagen, DK": a studio name in front of the street makes the whole query miss, and the event
 * silently landed on the city centre, a few kilometres off.
 */
export async function geocodeEventLocation(
  venueName: string,
  venueAddress: string,
  city: string,
  country: string,
): Promise<{ lat: number; lng: number; precision: "address" | "name" | "city" } | null> {
  const place = [city.trim(), country.trim()].filter(Boolean);
  if (place.length < 2) return null; // need at least city + country to mean anything

  const tries: Array<["address" | "name", string]> = [
    ["address", venueAddress.trim()],
    ["name", venueName.trim()],
  ];
  for (const [precision, first] of tries) {
    if (!first) continue;
    const hit = await geocodeAddress([first, ...place].join(", "));
    if (hit) return { ...hit, precision };
  }
  const cityHit = await geocodeAddress(place.join(", "));
  return cityHit ? { ...cityHit, precision: "city" } : null;
}

export type EventAddress = { venue_name?: string; full?: string };

/** The text a geocode is based on, to tell whether a saved location actually changed. */
function locationText(address: EventAddress | null | undefined): string {
  return [address?.venue_name ?? "", address?.full ?? ""].join("|").trim();
}

/**
 * Shared venue_id/address/lat/lng resolution for the organizer and admin event forms
 * (2026-07-22 — venue accumulation feature). A linked venue is always authoritative: its
 * own lat/lng wins and the free-text address is cleared (the venue join supplies the
 * display name instead, see lib/events.ts). With no venue link, falls back to geocoding
 * the free text — but only when there isn't already a real venue link or coordinates to
 * protect (`isUpdate` + `current`), so editing an unrelated field on an /addevent-sourced
 * event never clobbers its accurate coordinates. Changing the name or address text does
 * re-geocode (I-181): otherwise a corrected address kept the old, wrong pin.
 *
 * With `autoVenue` (I-181), a place name plus a street address that geocodes to the street
 * becomes a venue: the matching existing one if there is one (findMatchingVenue), otherwise a new
 * no-page Pin. Only when the text is new or changed, so re-saving an older event doesn't
 * suddenly create one. A name alone, a vague place ("Sierras de Córdoba") or an address that
 * only resolves to the city stays free text on the event.
 */
export async function resolveVenueLocation(
  // Accepts either the browser/server Supabase client or the admin client — both differ in
  // generic instantiation depending on call site, so this is intentionally untyped rather
  // than fighting each caller's specific SupabaseClient<...> shape for a two-column lookup.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  venueId: string | null,
  venueName: string,
  venueAddress: string,
  city: string,
  country: string,
  current?: { lat: number | null; lng: number | null; venue_id: string | null; address?: unknown } | null,
  autoVenue?: { source: VenueSource; createdBy: string | null },
): Promise<{ venue_id: string | null; address: EventAddress | null; lat?: number; lng?: number }> {
  if (venueId) {
    const { data: venue } = await supabase
      .from("venues")
      .select("id, lat, lng")
      .eq("id", venueId)
      .maybeSingle();
    const v = venue as { lat: number | null; lng: number | null } | null;
    return {
      venue_id: venueId,
      address: null,
      ...(v?.lat != null && v?.lng != null ? { lat: v.lat, lng: v.lng } : {}),
    };
  }

  // `?? ""`: a form loaded before this field existed posts no venueAddress at all.
  const name = (venueName ?? "").trim();
  const street = (venueAddress ?? "").trim();
  // Keys only when set, so an event with just a name stores { venue_name } exactly as before.
  const address: EventAddress | null =
    name || street ? { ...(name ? { venue_name: name } : {}), ...(street ? { full: street } : {}) } : null;
  // No current row (create path) → always geocode. With a current row (update path): only
  // geocode if a venue link is being removed, there was never any coordinate, or the location
  // text changed.
  const currentAddress =
    current?.address && typeof current.address === "object" ? (current.address as EventAddress) : null;
  const shouldGeocode =
    !current ||
    current.venue_id != null ||
    (current.lat == null && current.lng == null) ||
    locationText(currentAddress) !== locationText(address);
  const coords = shouldGeocode ? await geocodeEventLocation(name, street, city, country) : null;

  if (autoVenue && name && street && coords?.precision === "address") {
    try {
      const place = { name, city: city.trim(), country: country.trim(), lat: coords.lat, lng: coords.lng };
      const existing = await findMatchingVenue(place);
      const venue =
        existing ?? (await createPinVenue({ ...place, address: street }, autoVenue.source, autoVenue.createdBy));
      if (!existing) await notifyNewVenue(place, autoVenue.source);
      return {
        venue_id: venue.id,
        address: null,
        lat: venue.lat ?? coords.lat,
        lng: venue.lng ?? coords.lng,
      };
    } catch {
      // A failed match or insert must not fail saving the event; it keeps the free text.
    }
  }

  return { venue_id: null, address, ...(coords ? { lat: coords.lat, lng: coords.lng } : {}) };
}
