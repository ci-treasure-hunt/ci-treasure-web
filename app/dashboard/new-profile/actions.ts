"use server";

import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { slugify } from "@/lib/events";
import { createClient } from "@/lib/supabase/server";

export type SimilarProfile = {
  id: string;
  name: string;
  slug: string;
  bioSnippet: string | null;
  visibility: string;
};

// Advisory only — never blocks creation. Backs the "similar profiles already exist" warning
// so someone doesn't accidentally create a duplicate of a profile that's already listed
// (including shadow profiles, which search_similar_profiles can see but a normal session can't).
export async function checkSimilarProfiles(name: string): Promise<SimilarProfile[]> {
  if (name.trim().length < 3) return [];

  const supabase = await createClient();
  const { data } = await supabase.rpc("search_similar_profiles", { p_name: name.trim() });

  return (data ?? []).map((p: { id: string; name: string; slug: string; bio_snippet: string | null; visibility: string }) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    bioSnippet: p.bio_snippet,
    visibility: p.visibility,
  }));
}

// Find a unique slug (idx_profiles_slug is UNIQUE on lower(slug)).
async function uniqueProfileSlug(admin: ReturnType<typeof createAdminClient>, name: string) {
  const base = slugify(name) || "profile";
  let candidate = base;
  for (let i = 2; i < 100; i += 1) {
    const { data } = await admin
      .from("profiles")
      .select("id")
      .ilike("slug", candidate)
      .maybeSingle();
    if (!data) {
      return candidate;
    }
    candidate = `${base}-${i}`;
  }
  // Extremely unlikely fallback: suffix with a random token.
  return `${base}-${Math.random().toString(36).slice(2, 7)}`;
}

export async function createProfile(input: {
  name: string;
  website: string;
  isOrganizer: boolean;
  isTeacher: boolean;
  isMusician: boolean;
}): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/auth?next=/dashboard/new-profile");
  }

  // Guard: one profile per user.
  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (existing) {
    redirect("/dashboard");
  }

  const name = input.name.trim();
  if (!name) {
    return { success: false, error: "Name is required." };
  }

  const admin = createAdminClient();
  const slug = await uniqueProfileSlug(admin, name);

  const { error } = await admin.from("profiles").insert({
    name,
    slug,
    website: input.website.trim() || null,
    user_id: user.id,
    // Shadow, not public: self-submitted profiles need admin review before going live (I-150).
    // Previously these auto-published immediately with no review at all — a stray "test" profile
    // and a studio submitted as if it were a person both slipped through before this was caught.
    visibility: "shadow",
    source: "self_submitted",
    is_organizer: input.isOrganizer,
    is_teacher: input.isTeacher,
    is_musician: input.isMusician,
    is_trusted: false,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  // Fire-and-forget admin notification (same pattern as app/events/actions.ts's
  // notifyAdminNewEvent). Best-effort: a failed notification must never block signup.
  notifyAdminNewProfile().catch(() => {});

  return { success: true };
}

// Admin group topic for new self-submitted profiles. No dedicated Telegram topic exists for
// this yet (unlike events' TELEGRAM_EVENT_THREAD_ID/claims' TELEGRAM_CLAIM_THREAD_ID) — falls
// back to the main admin chat until TELEGRAM_PROFILE_THREAD_ID is set.
const PROFILE_THREAD_ID = process.env.TELEGRAM_PROFILE_THREAD_ID
  ? Number(process.env.TELEGRAM_PROFILE_THREAD_ID)
  : undefined;

// No personal data at all here by design (I-159), same as the events/claims/report notifiers: a
// nudge to go look, not a record of who did what. Dropping the submitted name matters because a
// pending profile is not public yet — with it gone, every name this project sends to Telegram is
// one already published on the site.
async function notifyAdminNewProfile() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!token || !chatId) return;

  const text = [
    "New profile submitted.",
    "Review: https://citreasurehunt.com/admin/profiles/pending",
  ].join("\n");

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      ...(PROFILE_THREAD_ID ? { message_thread_id: PROFILE_THREAD_ID } : {}),
      text,
      link_preview_options: { is_disabled: true },
    }),
  });
}
