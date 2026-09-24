"use server";

// I-111 3a: moderation queue for community photos uploaded by the public. Approving copies the
// photo onto the community (replacing the live one, whose files are deleted); rejecting deletes the
// submission's files. Only approved photos ever reach communities.image_url.

import { revalidatePath } from "next/cache";

import { requireAdminUser } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { removeImageSet } from "@/lib/upload-action";

export type PendingCommunityPhoto = {
  id: string;
  communityId: string;
  communityName: string;
  communitySlug: string | null;
  communityStatus: string;
  imageUrl: string;
  imageCredit: string | null;
  contact: string | null;
  currentImageUrl: string | null;
  createdAt: string;
};

type Row = {
  id: string;
  community_id: string;
  image_url: string;
  image_credit: string | null;
  contact: string | null;
  created_at: string;
  communities: { name: string; slug: string | null; status: string; image_url: string | null; deleted_at: string | null } | null;
};

export async function getPendingCommunityPhotos(): Promise<PendingCommunityPhoto[]> {
  await requireAdminUser();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("community_photo_submissions")
    .select("id, community_id, image_url, image_credit, contact, created_at, communities(name, slug, status, image_url, deleted_at)")
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    communityId: r.community_id,
    communityName: r.communities?.name ?? "(unknown community)",
    communitySlug: r.communities?.slug ?? null,
    communityStatus: r.communities?.deleted_at ? "archived" : (r.communities?.status ?? "published"),
    imageUrl: r.image_url,
    imageCredit: r.image_credit,
    contact: r.contact,
    currentImageUrl: r.communities?.image_url ?? null,
    createdAt: r.created_at,
  }));
}

export async function approveCommunityPhoto(id: string): Promise<{ success: boolean; error?: string }> {
  await requireAdminUser();
  const admin = createAdminClient();

  const { data: sub } = await admin
    .from("community_photo_submissions")
    .select("id, community_id, image_url, image_credit, status, communities(slug, image_url)")
    .eq("id", id)
    .maybeSingle();
  if (!sub) return { success: false, error: "Not found." };
  if (sub.status !== "pending") return { success: false, error: "Already reviewed." };
  const community = (Array.isArray(sub.communities) ? sub.communities[0] : sub.communities) as
    | { slug: string | null; image_url: string | null }
    | null;

  const { error: updateError } = await admin
    .from("communities")
    .update({ image_url: sub.image_url, image_credit: sub.image_credit })
    .eq("id", sub.community_id);
  if (updateError) return { success: false, error: updateError.message };

  const { error } = await admin
    .from("community_photo_submissions")
    .update({ status: "approved", resolved_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { success: false, error: error.message };

  // The photo it replaces is no longer referenced anywhere.
  if (community?.image_url && community.image_url !== sub.image_url) {
    await removeImageSet(community.image_url, "community-images");
  }

  revalidatePath("/admin/communities/photos");
  revalidatePath("/admin", "layout");
  if (community?.slug) revalidatePath(`/communities/${community.slug}`);
  return { success: true };
}

export async function rejectCommunityPhoto(id: string, note: string): Promise<{ success: boolean; error?: string }> {
  await requireAdminUser();
  const admin = createAdminClient();

  const { data: sub } = await admin
    .from("community_photo_submissions")
    .select("image_url, status")
    .eq("id", id)
    .maybeSingle();
  if (!sub) return { success: false, error: "Not found." };
  if (sub.status !== "pending") return { success: false, error: "Already reviewed." };

  const { error } = await admin
    .from("community_photo_submissions")
    .update({ status: "rejected", admin_note: note.trim() || null, resolved_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { success: false, error: error.message };

  // The row stays as a record; the files go, so a rejected photo can't be reached by its URL.
  await removeImageSet(sub.image_url, "community-images");

  revalidatePath("/admin/communities/photos");
  revalidatePath("/admin", "layout");
  return { success: true };
}
