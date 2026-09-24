// I-111: server-side create/update of a community from the admin editor. Shared by
// app/api/admin/communities/route.ts (POST) and app/api/admin/communities/[id]/route.ts (PUT).
// Callers must have checked admin auth; everything here uses the service-role client.
//
// Order matters for privacy: links go through classifyCommunityLinks() before anything is
// written, so a group invite typed into any box lands in community_invites, never on the row.

import { revalidatePath } from "next/cache";

import {
  ACTIVITY_LEVELS,
  COMMUNITY_STATUSES,
  COMMUNITY_TYPES,
  FOCUS_OPTIONS,
  FRIENDLINESS_OPTIONS,
  parseLanguages,
  type AdminCommunityFormData,
} from "@/lib/admin-communities";
import { classifyCommunityLinks, inviteFlags, type InvitePlatform } from "@/lib/community-links";
import { deriveCommunityLocation } from "@/lib/community-regions";
import { setEntityEmail } from "@/lib/entity-email";
import { geocodeAddress } from "@/lib/geocode";
import { slugify } from "@/lib/slug";
import { createAdminClient } from "@/lib/supabase/admin";
import { removeImageIfUnused } from "@/lib/upload-action";

export class CommunitySaveError extends Error {
  constructor(
    message: string,
    public fieldErrors: Record<string, string> = {},
  ) {
    super(message);
  }
}

const str = (v: unknown) => String(v ?? "").trim();
const orNull = (v: unknown) => str(v) || null;

// Form field name ↔ classifier field name.
const LINK_FIELDS = {
  website: "website",
  newsletter: "newsletter",
  instagram: "instagram",
  facebookGroup: "facebook_group",
  facebookPage: "facebook_page",
  telegramGroup: "telegram_group",
  telegramChannel: "telegram_channel",
  whatsappGroup: "whatsapp_group",
  whatsappChannel: "whatsapp_channel",
  signalGroup: "signal_group",
  youtube: "youtube",
  calendar: "calendar",
  other: "other",
} as const;
const CLASSIFIER_TO_FORM = Object.fromEntries(
  Object.entries(LINK_FIELDS).map(([form, classifier]) => [classifier, form]),
) as Record<string, string>;

export async function createUniqueSlug(name: string, city: string): Promise<string> {
  const supabase = createAdminClient();
  const base = slugify(name) || "community";
  // Includes soft-deleted rows: communities.slug is UNIQUE across all rows.
  const { data, error } = await supabase.from("communities").select("slug").ilike("slug", `${base}%`);
  if (error) throw error;
  const taken = new Set((data ?? []).map((r) => String(r.slug).toLowerCase()));
  if (!taken.has(base)) return base;
  // Same order the Airtable sync used: name, then name-city, then name-2, name-3...
  // (`taken` already covers name-city, since it starts with the base.)
  const withCity = city ? `${base}-${slugify(city)}` : "";
  if (withCity && !taken.has(withCity)) return withCity;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

export async function saveCommunity(
  payload: Partial<AdminCommunityFormData>,
  id: string | null,
): Promise<{ id: string; slug: string }> {
  const supabase = createAdminClient();

  // ---- Validate basics -------------------------------------------------------------------------
  const name = str(payload.name);
  const type = str(payload.type);
  const status = str(payload.status) || "published";
  const worldwide = Boolean(payload.worldwide);
  const city = str(payload.city);
  const country = worldwide ? "" : str(payload.country).toUpperCase();
  const fieldErrors: Record<string, string> = {};
  if (!name) fieldErrors.name = "Name is required.";
  if (!(COMMUNITY_TYPES as readonly string[]).includes(type)) fieldErrors.type = "Pick a type.";
  if (!(COMMUNITY_STATUSES as readonly string[]).includes(status)) fieldErrors.status = "Invalid status.";
  if (!city) fieldErrors.city = worldwide ? "Say where, e.g. Worldwide or Latin America." : "City is required.";
  if (!worldwide && !/^[A-Z]{2}$/.test(country)) fieldErrors.country = "Pick a country, or tick Worldwide.";

  const activityLevel = str(payload.activityLevel);
  if (activityLevel && !(ACTIVITY_LEVELS as readonly string[]).includes(activityLevel)) {
    fieldErrors.activityLevel = "Invalid activity level.";
  }
  const friendliness = str(payload.friendliness);
  if (friendliness && !(FRIENDLINESS_OPTIONS as readonly string[]).includes(friendliness)) {
    fieldErrors.friendliness = "Invalid value.";
  }
  const audienceRaw = str(payload.audienceSize);
  const audienceSize = audienceRaw ? Number.parseInt(audienceRaw, 10) : null;
  if (audienceRaw && (!Number.isFinite(audienceSize) || (audienceSize ?? 0) < 0)) {
    fieldErrors.audienceSize = "Whole number, or leave empty.";
  }
  const lastVerified = str(payload.lastVerified);
  if (lastVerified && !/^\d{4}-\d{2}-\d{2}$/.test(lastVerified)) fieldErrors.lastVerified = "Use YYYY-MM-DD.";

  // ---- Links (privacy) -------------------------------------------------------------------------
  const linkInput = Object.fromEntries(
    Object.entries(LINK_FIELDS).map(([form, classifier]) => [classifier, str(payload[form as keyof AdminCommunityFormData])]),
  );
  const links = classifyCommunityLinks(linkInput);
  for (const [classifierField, message] of Object.entries(links.errors)) {
    fieldErrors[CLASSIFIER_TO_FORM[classifierField] ?? classifierField] = message;
  }

  if (Object.keys(fieldErrors).length > 0) {
    throw new CommunitySaveError("Please fix the highlighted fields.", fieldErrors);
  }

  // ---- Invites: stored ones, minus removals, plus anything newly classified -------------------
  // A new or changed invite URL starts unpublished: whether a private group link may be revealed
  // is a consent decision (organizer OK, link already public, or group public), made per link.
  const current = new Map<string, { url: string; published: boolean }>();
  if (id) {
    const { data: stored, error } = await supabase
      .from("community_invites")
      .select("platform, url, published")
      .eq("community_id", id);
    if (error) throw error;
    for (const row of stored ?? []) current.set(row.platform, { url: row.url, published: row.published });
  }
  for (const inv of payload.invites ?? []) {
    const existing = current.get(inv.platform);
    if (!existing) continue;
    if (inv.remove) current.delete(inv.platform);
    else current.set(inv.platform, { url: existing.url, published: Boolean(inv.published) });
  }
  for (const [platform, url] of Object.entries(links.invites) as Array<[InvitePlatform, string]>) {
    const existing = current.get(platform);
    current.set(platform, { url, published: existing?.url === url ? existing.published : false });
  }

  // ---- Location --------------------------------------------------------------------------------
  const addressForMap = orNull(payload.addressForMap);
  const manualLat = Number.parseFloat(str(payload.lat));
  const manualLng = Number.parseFloat(str(payload.lng));
  let lat: number | null = null;
  let lng: number | null = null;
  if (Number.isFinite(manualLat) && Number.isFinite(manualLng)) {
    lat = manualLat;
    lng = manualLng;
  } else if (!worldwide) {
    // Same rule as the venue editor: only geocode when the location text changed, so an unrelated
    // edit never moves the pin, and a deliberately empty pin isn't silently filled.
    const { data: prev } = id
      ? await supabase.from("communities").select("city, country, address_for_map, lat, lng").eq("id", id).maybeSingle()
      : { data: null };
    const changed =
      !prev || prev.city !== city || prev.country !== country || prev.address_for_map !== addressForMap;
    if (changed) {
      const coords = await geocodeAddress([addressForMap, city, country].filter(Boolean).join(", "));
      lat = coords?.lat ?? prev?.lat ?? null;
      lng = coords?.lng ?? prev?.lng ?? null;
    } else {
      lat = prev?.lat ?? null;
      lng = prev?.lng ?? null;
    }
  }
  const { region, continent } = deriveCommunityLocation(worldwide ? null : country, orNull(payload.region));

  // ---- Row -------------------------------------------------------------------------------------
  const row = {
    name,
    type,
    status,
    activity_level: activityLevel || null,
    focus: (payload.focus ?? []).filter((f) => (FOCUS_OPTIONS as readonly string[]).includes(f)),
    languages: parseLanguages(str(payload.languages)),
    description: orNull(payload.description),
    city,
    country: worldwide ? null : country,
    region,
    continent,
    address_for_map: addressForMap,
    lat,
    lng,
    ...links.columns,
    ...inviteFlags(current.keys()),
    contact_person: orNull(payload.contactPerson),
    submitter_contact: orNull(payload.submitterContact),
    audience_size: audienceSize,
    friendliness: friendliness || null,
    last_verified: lastVerified || null,
    admin_notes: orNull(payload.adminNotes),
    image_url: orNull(payload.imageUrl),
    image_credit: orNull(payload.imageCredit),
  };

  // A replaced or removed photo leaves its files behind in the bucket; clean them up after the save.
  const { data: previousImage } = id
    ? await supabase.from("communities").select("image_url").eq("id", id).maybeSingle()
    : { data: null };

  let saved: { id: string; slug: string };
  if (id) {
    const { data, error } = await supabase.from("communities").update(row).eq("id", id).select("id, slug").single();
    if (error) throw error;
    saved = data;
  } else {
    const slug = await createUniqueSlug(name, city);
    const { data, error } = await supabase
      .from("communities")
      .insert({ ...row, slug })
      .select("id, slug")
      .single();
    if (error) throw error;
    saved = data;
  }

  await removeImageIfUnused(previousImage?.image_url, row.image_url);

  // ---- Invites + email -------------------------------------------------------------------------
  const { data: storedAfter } = await supabase.from("community_invites").select("platform").eq("community_id", saved.id);
  const toDelete = (storedAfter ?? []).map((r) => r.platform).filter((p) => !current.has(p));
  if (toDelete.length > 0) {
    const { error } = await supabase
      .from("community_invites")
      .delete()
      .eq("community_id", saved.id)
      .in("platform", toDelete);
    if (error) throw error;
  }
  if (current.size > 0) {
    const { error } = await supabase.from("community_invites").upsert(
      [...current.entries()].map(([platform, v]) => ({
        community_id: saved.id,
        platform,
        url: v.url,
        published: v.published,
        synced_at: new Date().toISOString(),
      })),
      { onConflict: "community_id,platform" },
    );
    if (error) throw error;
  }

  const emailResult = await setEntityEmail("community", saved.id, str(payload.email));
  if (emailResult.error) throw new Error(emailResult.error);

  // The row write already fires on_communities_write_revalidate; invite/email changes don't touch
  // the row when nothing else changed, so revalidate explicitly as well.
  revalidatePath("/communities");
  revalidatePath(`/communities/${saved.slug}`);

  return saved;
}
