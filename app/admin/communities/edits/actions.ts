"use server";

// I-111 Stage 2: queue of "Suggest an edit" submissions. Nothing auto-applies: the admin makes the
// change in /admin/communities/[id]/edit, then marks the suggestion applied or dismissed here.

import { revalidatePath } from "next/cache";

import { requireAdminUser } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export type EditSuggestion = {
  id: string;
  communityId: string;
  communityName: string;
  communitySlug: string | null;
  communityStatus: string;
  communityArchived: boolean;
  requestType: string;
  fields: string[];
  newValue: string;
  contact: string | null;
  createdAt: string;
};

type Row = {
  id: string;
  community_id: string;
  request_type: string;
  fields: string[] | null;
  new_value: string;
  contact: string | null;
  created_at: string;
  communities: { name: string; slug: string | null; status: string; deleted_at: string | null } | null;
};

export async function getOpenEditSuggestions(): Promise<EditSuggestion[]> {
  await requireAdminUser();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("community_edit_suggestions")
    .select("id, community_id, request_type, fields, new_value, contact, created_at, communities(name, slug, status, deleted_at)")
    .eq("status", "open")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    communityId: r.community_id,
    communityName: r.communities?.name ?? "(unknown community)",
    communitySlug: r.communities?.slug ?? null,
    communityStatus: r.communities?.status ?? "published",
    communityArchived: Boolean(r.communities?.deleted_at),
    requestType: r.request_type,
    fields: r.fields ?? [],
    newValue: r.new_value,
    contact: r.contact,
    createdAt: r.created_at,
  }));
}

export async function resolveEditSuggestion(
  id: string,
  status: "applied" | "dismissed",
  note: string,
): Promise<{ success: boolean; error?: string }> {
  await requireAdminUser();
  if (status !== "applied" && status !== "dismissed") return { success: false, error: "Invalid status." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("community_edit_suggestions")
    .update({ status, admin_note: note.trim() || null, resolved_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "open");
  if (error) return { success: false, error: error.message };

  revalidatePath("/admin/communities/edits");
  revalidatePath("/admin", "layout");
  return { success: true };
}
