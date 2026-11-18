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
  linksConsent: boolean;
  createdAt: string;
};

type Row = {
  id: string;
  community_id: string;
  request_type: string;
  fields: string[] | null;
  new_value: string;
  contact: string | null;
  links_consent: boolean;
  created_at: string;
  communities: { name: string; slug: string | null; status: string; deleted_at: string | null } | null;
};

export async function getOpenEditSuggestions(): Promise<EditSuggestion[]> {
  await requireAdminUser();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("community_edit_suggestions")
    .select("id, community_id, request_type, fields, new_value, contact, links_consent, created_at, communities(name, slug, status, deleted_at)")
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
    linksConsent: r.links_consent,
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

  // A new group link the submitter confirmed as admin (or with an admin's OK) goes public on
  // approval. The link itself is saved in the editor first, as for every edit; this only flips the
  // matching invite's published flag. No match means the editor step was skipped, so stop rather
  // than mark it applied with the link still missing.
  if (status === "applied") {
    const { data: suggestion } = await admin
      .from("community_edit_suggestions")
      .select("community_id, new_value, links_consent, communities(slug)")
      .eq("id", id)
      .maybeSingle<{ community_id: string; new_value: string; links_consent: boolean; communities: { slug: string | null } | null }>();
    if (suggestion?.links_consent) {
      const submitted = new Set((suggestion.new_value.match(/https?:\/\/\S+/g) ?? []).map(inviteKey));
      const { data: invites } = await admin
        .from("community_invites")
        .select("id, url")
        .eq("community_id", suggestion.community_id);
      const matching = (invites ?? []).filter((i) => submitted.has(inviteKey(i.url as string)));
      if (!matching.length) {
        return {
          success: false,
          error: "The admin OK'd this link, but it isn't saved on the community yet. Add it in the editor first, then mark applied.",
        };
      }
      const { error: publishError } = await admin
        .from("community_invites")
        .update({ published: true })
        .in("id", matching.map((i) => i.id));
      if (publishError) return { success: false, error: publishError.message };
      if (suggestion.communities?.slug) revalidatePath(`/communities/${suggestion.communities.slug}`);
    }
  }

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

// Invite links arrive with share-tracking query strings (WhatsApp adds ?s=cl&p=i&...), which the
// editor strips, so compare host + path only.
function inviteKey(raw: string): string {
  try {
    const u = new URL(raw.trim());
    return `${u.hostname.toLowerCase().replace(/^www\./, "")}${u.pathname.replace(/\/+$/, "")}`;
  } catch {
    return raw.trim();
  }
}
