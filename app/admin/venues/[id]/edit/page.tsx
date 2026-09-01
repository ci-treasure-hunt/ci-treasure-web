import { VenueForm } from "@/components/admin/venue-form";
import { createEmptyVenueFormData, type AdminVenueFormData } from "@/lib/admin-venues";
import { requireAdminUser } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";

import { getEntityEmail } from "@/lib/entity-email";
export default async function AdminEditVenuePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminUser();
  const { id } = await params;
  const supabase = createAdminClient();

  const { data: venue, error } = await supabase
    .from("venues")
    .select(
      "id, name, slug, city, country, region, address, lat, lng, description, website, newsletter, facebook, instagram, youtube, image_url, image_credit, visibility, show_in_list, show_in_announce, announce_name, admin_notes",
    )
    .eq("id", id)
    .single();

  if (error || !venue) {
    throw new Error(error?.message ?? "Venue not found.");
  }

  const initialVenue: AdminVenueFormData = {
    ...createEmptyVenueFormData(),
    id: venue.id,
    name: venue.name,
    slug: venue.slug,
    city: venue.city,
    country: venue.country,
    region: venue.region ?? "",
    address: venue.address ?? "",
    lat: venue.lat != null ? String(venue.lat) : "",
    lng: venue.lng != null ? String(venue.lng) : "",
    description: venue.description ?? "",
    website: venue.website ?? "",
    email: (await getEntityEmail("venue", venue.id)) ?? "",
    newsletter: venue.newsletter ?? "",
    facebook: venue.facebook ?? "",
    instagram: venue.instagram ?? "",
    youtube: venue.youtube ?? "",
    imageUrl: venue.image_url ?? "",
    imageCredit: venue.image_credit ?? "",
    visibility: venue.visibility,
    showInList: venue.show_in_list,
    showInAnnounce: venue.show_in_announce,
    announceName: venue.announce_name ?? "",
    adminNotes: venue.admin_notes ?? "",
  };

  return <VenueForm mode="edit" initialVenue={initialVenue} />;
}
