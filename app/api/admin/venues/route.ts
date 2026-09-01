import { NextResponse, type NextRequest } from "next/server";

import { requireAdminRequestUser } from "@/lib/admin-api";
import { geocodeAddress } from "@/lib/geocode";
import { slugify } from "@/lib/slug";
import { createAdminClient } from "@/lib/supabase/admin";

import { setEntityEmail } from "@/lib/entity-email";
async function createUniqueSlug(baseSlug: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("venues").select("slug").ilike("slug", `${baseSlug}%`);
  if (error) throw error;

  const existing = new Set((data ?? []).map((row) => String(row.slug).toLowerCase()));
  if (!existing.has(baseSlug)) return baseSlug;

  let suffix = 2;
  while (existing.has(`${baseSlug}-${suffix}`)) suffix += 1;
  return `${baseSlug}-${suffix}`;
}

// Two callers share this route: (1) the inline quick-add from the event form, which sends
// only name/city/country/address and deliberately always lands as 'hidden' (see below —
// that path skips the addvenue skill's research, so it can't make a real visibility-tier
// call); (2) the full /admin/venues/new form (I-088 admin UI), which sends every field and
// picks its own visibility/show_in_list. Optional fields all default to the quick-add's
// original behavior when omitted, so caller (1) is unaffected by this extension.
export async function POST(request: NextRequest) {
  try {
    await requireAdminRequestUser(request);
    const payload = await request.json();
    const name = String(payload.name ?? "").trim();
    const city = String(payload.city ?? "").trim();
    const country = String(payload.country ?? "").trim();
    const address = String(payload.address ?? "").trim();

    if (!name || !city || !country) {
      return NextResponse.json({ error: "Name, city, and country are required." }, { status: 400 });
    }

    const manualLat = Number.parseFloat(String(payload.lat ?? ""));
    const manualLng = Number.parseFloat(String(payload.lng ?? ""));
    const hasManualCoords = Number.isFinite(manualLat) && Number.isFinite(manualLng);
    const coords = hasManualCoords
      ? { lat: manualLat, lng: manualLng }
      : await geocodeAddress([address || name, city, country].filter(Boolean).join(", "));

    const supabase = createAdminClient();
    const slug = await createUniqueSlug(slugify(String(payload.slug ?? "").trim() || name) || "venue");
    const { data, error } = await supabase
      .from("venues")
      .insert({
        name,
        slug,
        city,
        country,
        region: String(payload.region ?? "").trim() || null,
        address: address || null,
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
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
      })
      .select("id, name, city, country, lat, lng")
      .single();
    if (error) throw error;

    // I-165 F3: address goes to entity_emails, not venues.email.
    await setEntityEmail("venue", data.id, String(payload.email ?? ""));

    return NextResponse.json({ venue: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create venue." },
      { status: 500 },
    );
  }
}
