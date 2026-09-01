import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";

import { requireAdminRequestUser } from "@/lib/admin-api";
import { createAdminClient } from "@/lib/supabase/admin";
import { geocodeAddress } from "@/lib/geocode";

import { setEntityEmail } from "@/lib/entity-email";
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdminRequestUser(request);
    const { id } = await params;
    const payload = await request.json();
    const supabase = createAdminClient();

    const name = String(payload.name ?? "").trim();
    const city = String(payload.city ?? "").trim();
    const country = String(payload.country ?? "").trim();
    const address = String(payload.address ?? "").trim();
    if (!name || !city || !country) {
      return NextResponse.json({ error: "Name, city, and country are required." }, { status: 400 });
    }

    // Manual lat/lng always wins if provided (an admin correcting a bad geocode). Otherwise
    // only re-geocode when the location text actually changed from what's stored — editing
    // an unrelated field (e.g. fixing a typo in the description) shouldn't silently move the
    // pin, same protection resolveVenueLocation gives the event form. Deliberately does NOT
    // force a geocode attempt just because current coords are null: a handful of venues
    // (e.g. Leviathan Studio, Rhizome Springs — off-grid islands, no public address) have
    // null lat/lng on purpose, documented as "confirmed unfillable, don't re-research" in
    // I-088. Auto-retrying on every unrelated save would silently overwrite that deliberate
    // null with a misleading city-center approximation.
    const manualLat = Number.parseFloat(String(payload.lat ?? ""));
    const manualLng = Number.parseFloat(String(payload.lng ?? ""));
    const hasManualCoords = Number.isFinite(manualLat) && Number.isFinite(manualLng);

    let lat: number | null = hasManualCoords ? manualLat : null;
    let lng: number | null = hasManualCoords ? manualLng : null;
    if (!hasManualCoords) {
      const { data: current } = await supabase
        .from("venues")
        .select("address, city, country, lat, lng")
        .eq("id", id)
        .maybeSingle();
      const locationChanged =
        !current || current.address !== (address || null) || current.city !== city || current.country !== country;
      if (locationChanged) {
        const coords = await geocodeAddress([address || name, city, country].filter(Boolean).join(", "));
        lat = coords?.lat ?? current?.lat ?? null;
        lng = coords?.lng ?? current?.lng ?? null;
      } else {
        lat = current?.lat ?? null;
        lng = current?.lng ?? null;
      }
    }

    const { error } = await supabase
      .from("venues")
      .update({
        name,
        city,
        country,
        region: String(payload.region ?? "").trim() || null,
        address: address || null,
        lat,
        lng,
        description: String(payload.description ?? "").trim() || null,
        website: String(payload.website ?? "").trim() || null,
        newsletter: String(payload.newsletter ?? "").trim() || null,
        facebook: String(payload.facebook ?? "").trim() || null,
        instagram: String(payload.instagram ?? "").trim() || null,
        youtube: String(payload.youtube ?? "").trim() || null,
        image_url: String(payload.imageUrl ?? "").trim() || null,
        image_credit: String(payload.imageCredit ?? "").trim() || null,
        admin_notes: String(payload.adminNotes ?? "").trim() || null,
        visibility: payload.visibility === "public" ? "public" : "hidden",
        show_in_list: Boolean(payload.showInList),
        show_in_announce: Boolean(payload.showInAnnounce),
        announce_name: String(payload.announceName ?? "").trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) throw error;

    // I-165 F3: address goes to entity_emails, not venues.email.
    await setEntityEmail("venue", id, String(payload.email ?? ""));

    // Cached ISR pages (the /venues directory, this venue's own detail page, and any event
    // page linking to it) won't otherwise pick up an admin edit for up to an hour.
    revalidatePath("/venues");
    revalidatePath("/venues/[slug]", "page");
    revalidatePath("/events/[eventSlug]", "page");

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update venue." },
      { status: 500 },
    );
  }
}
