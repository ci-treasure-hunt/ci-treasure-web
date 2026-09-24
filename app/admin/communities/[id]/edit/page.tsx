import { CommunityForm } from "@/components/admin/community-form";
import { createEmptyCommunityFormData, type AdminCommunityFormData } from "@/lib/admin-communities";
import { requireAdminUser } from "@/lib/admin-auth";
import { deriveCommunityLocation } from "@/lib/community-regions";
import { getEntityEmail } from "@/lib/entity-email";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function AdminEditCommunityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminUser();
  const { id } = await params;
  const supabase = createAdminClient();

  const [{ data: c, error }, { data: invites }] = await Promise.all([
    supabase
      .from("communities")
      .select(
        "id, name, slug, type, status, activity_level, focus, languages, description, city, country, region, address_for_map, lat, lng, website, newsletter, instagram, facebook_group, facebook_page, telegram_group, telegram_channel, whatsapp_channel, youtube, calendar, other_resource, contact_person, submitter_contact, audience_size, friendliness, last_verified, admin_notes, image_url, image_credit, deleted_at, updated_at",
      )
      .eq("id", id)
      .single(),
    supabase.from("community_invites").select("platform, url, published").eq("community_id", id).order("platform"),
  ]);

  if (error || !c) {
    throw new Error(error?.message ?? "Community not found.");
  }

  const initialCommunity: AdminCommunityFormData = {
    ...createEmptyCommunityFormData(),
    id: c.id,
    name: c.name,
    slug: c.slug ?? "",
    type: c.type ?? "General CI Community",
    status: c.status,
    activityLevel: c.activity_level ?? "",
    focus: c.focus ?? [],
    languages: (c.languages ?? []).join(", "),
    description: c.description ?? "",
    worldwide: !c.country,
    city: c.city ?? "",
    country: c.country ?? "",
    // Shown only when it differs from what the country would give, i.e. was picked by hand, so a
    // manual pick survives the next save. Blank means "derive", which every existing row is.
    region: c.country && c.region !== deriveCommunityLocation(c.country).region ? (c.region ?? "") : "",
    addressForMap: c.address_for_map ?? "",
    lat: c.lat != null ? String(c.lat) : "",
    lng: c.lng != null ? String(c.lng) : "",
    website: c.website ?? "",
    newsletter: c.newsletter ?? "",
    instagram: c.instagram ?? "",
    facebookGroup: c.facebook_group ?? "",
    facebookPage: c.facebook_page ?? "",
    telegramGroup: c.telegram_group ?? "",
    telegramChannel: c.telegram_channel ?? "",
    whatsappChannel: c.whatsapp_channel ?? "",
    youtube: c.youtube ?? "",
    calendar: c.calendar ?? "",
    other: c.other_resource ?? "",
    invites: (invites ?? []).map((inv) => ({ ...inv, remove: false })),
    email: (await getEntityEmail("community", c.id)) ?? "",
    contactPerson: c.contact_person ?? "",
    submitterContact: c.submitter_contact ?? "",
    audienceSize: c.audience_size != null ? String(c.audience_size) : "",
    friendliness: c.friendliness ?? "",
    lastVerified: c.last_verified ?? "",
    adminNotes: c.admin_notes ?? "",
    imageUrl: c.image_url ?? "",
    imageCredit: c.image_credit ?? "",
    deletedAt: c.deleted_at,
  };

  // Keyed on updated_at so the client form remounts with the saved state after router.refresh():
  // a save can move links between boxes (an invite typed into "Other" becomes a private invite),
  // and a form holding its pre-save state would show them where they no longer are.
  return <CommunityForm key={c.updated_at} mode="edit" initialCommunity={initialCommunity} />;
}
