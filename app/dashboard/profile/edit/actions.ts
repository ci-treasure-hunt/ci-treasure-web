"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { SELF_SELECTABLE_PRACTICES } from "@/lib/practices";

import { setEntityEmail } from "@/lib/entity-email";
export type ProfileUpdateData = {
  bio: string;
  city: string;
  country: string;
  is_nomadic: boolean;
  website: string;
  facebook: string;
  instagram: string;
  youtube: string;
  telegram: string;
  newsletter: string;
  public_email: string;
  is_organizer: boolean;
  is_teacher: boolean;
  is_musician: boolean;
  discipline: string[];
};

function normalizeInstagram(value: string): string {
  if (!value) return "";
  if (value.startsWith("http")) return value;
  const handle = value.replace(/^@/, "");
  return `https://instagram.com/${handle}`;
}

function normalizeTelegram(value: string): string {
  if (!value) return "";
  if (value.startsWith("http")) return value;
  const handle = value.replace(/^@/, "");
  return `https://t.me/${handle}`;
}

export async function updateProfile(data: ProfileUpdateData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  const { data: ownProfile } = await supabase
    .from("profiles")
    .select("id, discipline")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!ownProfile) {
    return { success: false, error: "Profile not found" };
  }

  // Re-derive locked roles server-side rather than trusting the client's booleans directly —
  // a role backed by a real event_organizers/event_teachers row must never be turned off,
  // regardless of what a direct (UI-bypassing) call sends.
  const [{ data: organizerLinks }, { data: teacherLinks }] = await Promise.all([
    supabase.from("event_organizers").select("id").eq("organizer_id", ownProfile.id).limit(1),
    supabase.from("event_teachers").select("role").eq("teacher_id", ownProfile.id),
  ]);
  const lockedOrganizer = Boolean(organizerLinks?.length);
  const lockedMusician = Boolean(teacherLinks?.some((t) => t.role === "musician"));
  const lockedTeacher = Boolean(teacherLinks?.some((t) => t.role !== "musician"));

  // Convert empty strings to null for optional fields so DB stays clean
  const nullIfEmpty = (v: string) => v.trim() === "" ? null : v.trim();

  // Practice (I-135): re-validate against the controlled vocabulary server-side, so a
  // hand-crafted request can't store an arbitrary/free-text practice — the picker is the
  // only intended writer, but the server is the actual guarantee. The allow-list is the
  // self-selectable set PLUS whatever is already stored on the profile, so a curated
  // non-picker practice (e.g. an admin-backfilled `yoga`) survives a self-edit — the user
  // still can't ADD anything outside the picker. Dedup, and store NULL (not []) when empty.
  // Uses effective teacher status (a locked teacher can't be un-teachered by a crafted call);
  // for a genuine non-teacher, leave whatever's stored untouched rather than wiping it.
  const storedDiscipline = ((ownProfile.discipline as string[] | null) ?? []);
  const isTeacherEffective = data.is_teacher || lockedTeacher;
  const allowedPractices = new Set<string>([...SELF_SELECTABLE_PRACTICES, ...storedDiscipline]);
  const validatedDiscipline = isTeacherEffective
    ? Array.from(new Set((data.discipline ?? []).filter((d) => allowedPractices.has(d))))
    : storedDiscipline;

  // Belt-and-suspenders alongside the DB check constraint: never send a populated city/country
  // alongside is_nomadic=true, regardless of what the client sent.
  const normalizedData = {
    bio:          nullIfEmpty(data.bio),
    city:         data.is_nomadic ? null : nullIfEmpty(data.city),
    country:      data.is_nomadic ? null : nullIfEmpty(data.country),
    is_nomadic:   data.is_nomadic,
    website:      nullIfEmpty(data.website),
    facebook:     nullIfEmpty(data.facebook),
    instagram:    nullIfEmpty(normalizeInstagram(data.instagram)),
    youtube:      nullIfEmpty(data.youtube),
    telegram:     nullIfEmpty(normalizeTelegram(data.telegram)),
    newsletter:   nullIfEmpty(data.newsletter),
    is_organizer: data.is_organizer || lockedOrganizer,
    is_teacher:   data.is_teacher || lockedTeacher,
    is_musician:  data.is_musician || lockedMusician,
    discipline:   validatedDiscipline.length ? validatedDiscipline : null,
    updated_at:   new Date().toISOString(),
  };

  const { data: updated, error } = await supabase
    .from("profiles")
    .update(normalizedData)
    .eq("user_id", user.id)
    .select("id, slug")
    .single();

  if (error) {
    console.error("Error updating profile:", error);
    return { success: false, error: error.message };
  }

  // I-165 F3: the address lives in entity_emails, not profiles.public_email. The update above
  // is scoped by .eq("user_id", user.id), so this only ever touches the caller's own profile.
  await setEntityEmail("profile", updated.id, data.public_email);

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/profile/edit");
  if (updated?.slug) {
    revalidatePath(`/teachers/${updated.slug}`);
  }

  return { success: true };
}

// Admin group topic for profile deactivations + deletion requests (env-overridable).
const DELETIONS_THREAD_ID = Number(process.env.TELEGRAM_DELETIONS_THREAD_ID ?? 702);

// No profile name here by design, same reasoning as the claims notifier — a nudge to go
// look, not a record of who did what, avoids putting personal data in Telegram.
async function notifyAdminDeletions(message: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!token || !chatId) return;

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      message_thread_id: DELETIONS_THREAD_ID,
      text: message,
      link_preview_options: { is_disabled: true },
    }),
  });
}

export async function setProfileDeactivated(deactivated: boolean) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  const { data: updated, error } = await supabase
    .from("profiles")
    .update({ visibility: deactivated ? "deactivated" : "public", updated_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .select("slug")
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  if (deactivated) {
    notifyAdminDeletions("🙈 A profile was deactivated (self-service).").catch(() => {});
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/profile/edit");
  if (updated?.slug) {
    revalidatePath(`/teachers/${updated.slug}`);
  }

  return { success: true };
}

export async function requestProfileDeletion() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ deletion_requested_at: new Date().toISOString() })
    .eq("user_id", user.id);

  if (error) {
    return { success: false, error: error.message };
  }

  notifyAdminDeletions("🗑️ A profile requested permanent deletion.").catch(() => {});

  revalidatePath("/dashboard/profile/edit");
  return { success: true };
}
