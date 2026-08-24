"use server";

import { revalidatePath } from "next/cache";

import { requireAdminUser } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export type PendingProfilePhoto = {
  id: string;
  slug: string;
  name: string;
  imageUrl: string;
  imageCredit: string | null;
};

export async function getPendingProfilePhotos(): Promise<PendingProfilePhoto[]> {
  await requireAdminUser();
  const admin = createAdminClient();

  const { data } = await admin
    .from("profiles")
    .select("id, slug, name, image_url, image_credit, updated_at")
    .eq("image_status", "pending")
    .not("image_url", "is", null)
    .order("updated_at", { ascending: true });

  return (data ?? []).map((row) => ({
    id: row.id as string,
    slug: row.slug as string,
    name: row.name as string,
    // No cache-busting needed here anymore: app/api/dashboard/profile-photo/route.ts now
    // writes each upload to a random filename rather than the old deterministic `${slug}.jpg`,
    // so a re-upload is always a URL no cache has seen before.
    imageUrl: row.image_url as string,
    imageCredit: (row.image_credit as string) ?? null,
  }));
}

export async function approveProfilePhoto(profileId: string): Promise<{ success: boolean; error?: string }> {
  await requireAdminUser();
  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("slug")
    .eq("id", profileId)
    .maybeSingle();

  const { error } = await admin.from("profiles").update({ image_status: "approved" }).eq("id", profileId);
  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/admin/profile-photos");
  if (profile?.slug) {
    revalidatePath(`/teachers/${profile.slug}`);
  }
  return { success: true };
}

export async function rejectProfilePhoto(profileId: string): Promise<{ success: boolean; error?: string }> {
  await requireAdminUser();
  const admin = createAdminClient();

  // Rejection clears image_url rather than leaving a hidden rejected photo sitting
  // in the row - the teacher's profile just shows no photo (existing empty state).
  // No reason field: profiles has no admin_notes-equivalent column the way events
  // does, and the uploader's own dashboard already explains "wasn't approved, try
  // again" - simplified from the spec's optional reason-capture, not a gap.
  const { error } = await admin
    .from("profiles")
    .update({ image_status: "rejected", image_url: null, image_credit: null })
    .eq("id", profileId);
  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/admin/profile-photos");
  return { success: true };
}
