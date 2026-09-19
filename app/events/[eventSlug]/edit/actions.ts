"use server";

import { revalidatePath } from "next/cache";

import { isAdminEmail } from "@/lib/admin-auth";
import { sendEmail } from "@/lib/email";
import { buildEventSlug } from "@/lib/events";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyAdminTeacherAdded } from "@/lib/notify";

type TeacherActionResult = { success: boolean; error?: string };

async function isAuthorized(supabase: Awaited<ReturnType<typeof createClient>>, eventId: string, userId: string) {
  // Authorization check: owner, or linked as an organizer via an owned profile.
  const { data: event } = await supabase
    .from("events")
    .select("user_id, editors")
    .eq("id", eventId)
    .maybeSingle();

  if (!event) return false;
  if (event.user_id === userId) return true;
  if (event.editors?.includes(userId)) return true;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (profile) {
    const { data: link } = await supabase
      .from("event_organizers")
      .select("event_id")
      .eq("event_id", eventId)
      .eq("organizer_id", profile.id)
      .maybeSingle();
    if (link) return true;
  }

  return false;
}

export async function addTeacher(
  eventId: string,
  profileId: string,
  role: string,
): Promise<TeacherActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { success: false, error: "Not signed in" };

  if (!(await isAuthorized(supabase, eventId, user.id))) {
    return { success: false, error: "Not authorized" };
  }

  // Admin client, not the caller's: profiles_select_public only exposes visibility = 'public'
  // (or your own row), so a just-suggested organizer_submitted stub is invisible here and this
  // lookup failed with "Teacher profile not found" — blocking the very teacher the organizer
  // had been allowed to add (2026-09-19). Authorization for this event is already settled by
  // isAuthorized() above, and event_teachers_insert gates on the event, never the teacher row,
  // so reading the name here grants nothing the caller couldn't already do.
  const { data: teacher, error: fetchTeacherError } = await createAdminClient()
    .from("profiles")
    .select("name, user_id")
    .eq("id", profileId)
    .single();

  if (fetchTeacherError || !teacher) {
    return { success: false, error: "Teacher profile not found" };
  }

  const { error: insertError } = await supabase
    .from("event_teachers")
    .insert({ event_id: eventId, teacher_id: profileId, role });

  if (insertError) {
    return { success: false, error: insertError.message };
  }

  // Handle notifications
  const { data: event } = await supabase
    .from("events")
    .select("title, short_id")
    .eq("id", eventId)
    .single();

  const { data: actorProfile } = await supabase
    .from("profiles")
    .select("name")
    .eq("user_id", user.id)
    .maybeSingle();

  const organizerName = actorProfile?.name ?? user.email ?? "Unknown organizer";

  // 1. Email teacher if claimed
  if (teacher.user_id) {
    const admin = createAdminClient();
    const { data: teacherUser } = await admin.auth.admin.getUserById(teacher.user_id);
    const email = teacherUser?.user?.email;
    if (email) {
      await sendEmail({
        to: email,
        subject: `You were added as a ${role} to ${event?.title}`,
        text: `${organizerName} added you as a ${role} to ${event?.title}. Not right? Reply to this email or contact hello@citreasurehunt.com and we'll remove it.`,
      });
    }
  }

  // 2. Telegram alert if not admin and event is already published
  const { data: fullEvent } = await supabase
    .from("events")
    .select("status")
    .eq("id", eventId)
    .single();

  const isAdmin = await isAdminEmail(user.email);
  if (!isAdmin && fullEvent?.status === "published" && event) {
    await notifyAdminTeacherAdded(
      organizerName,
      teacher.name,
      role,
      event.title,
      event.short_id || "",
    );
  }

  revalidatePath("/dashboard");
  if (event?.short_id && event?.title) {
    revalidatePath(`/events/${buildEventSlug(event.short_id, event.title)}/edit`);
  }
  return { success: true };
}

export async function updateTeacherRole(
  eventId: string,
  teacherId: string,
  role: string,
): Promise<TeacherActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { success: false, error: "Not signed in" };

  if (!(await isAuthorized(supabase, eventId, user.id))) {
    return { success: false, error: "Not authorized" };
  }

  const { error: updateError } = await supabase
    .from("event_teachers")
    .update({ role })
    .eq("event_id", eventId)
    .eq("teacher_id", teacherId);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  revalidatePath("/dashboard");
  return { success: true };
}

export async function removeTeacher(
  eventId: string,
  teacherId: string,
): Promise<TeacherActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { success: false, error: "Not signed in" };

  // For removal, authorization is: organizer OR the teacher themselves.
  let authorized = await isAuthorized(supabase, eventId, user.id);
  if (!authorized) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (profile && profile.id === teacherId) {
      authorized = true;
    }
  }

  if (!authorized) {
    return { success: false, error: "Not authorized" };
  }

  const { error: deleteError } = await supabase
    .from("event_teachers")
    .delete()
    .eq("event_id", eventId)
    .eq("teacher_id", teacherId);

  if (deleteError) {
    return { success: false, error: deleteError.message };
  }

  revalidatePath("/dashboard");
  return { success: true };
}

// Organizer management is gated more tightly than teacher management, deliberately mirroring
// RLS: event_organizers_insert/_delete allow the event owner, an editor, or an admin, but NOT
// someone merely linked as an organizer (unlike event_teachers, whose policies also accept
// is_event_organizer). Checking it here means a co-organizer gets a sentence instead of a bare
// "violates row-level security policy". Who is credited with running an event is also exactly
// the kind of thing that shouldn't be editable by everyone it's shared with.
async function canManageOrganizers(
  supabase: Awaited<ReturnType<typeof createClient>>,
  eventId: string,
  user: { id: string; email?: string },
) {
  const { data: event } = await supabase
    .from("events")
    .select("user_id, editors")
    .eq("id", eventId)
    .maybeSingle();

  if (!event) return false;
  if (event.user_id === user.id) return true;
  if (event.editors?.includes(user.id)) return true;
  return isAdminEmail(user.email);
}

export async function addOrganizer(
  eventId: string,
  profileId: string,
): Promise<TeacherActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { success: false, error: "Not signed in" };
  if (!(await canManageOrganizers(supabase, eventId, user))) {
    return { success: false, error: "Only the event's owner can change who is organizing it." };
  }

  // Admin client for the same reason as addTeacher's lookup: a just-suggested
  // organizer_submitted stub is shadow, so the caller's own client cannot see it.
  const { data: profile, error: fetchError } = await createAdminClient()
    .from("profiles")
    .select("name")
    .eq("id", profileId)
    .single();

  if (fetchError || !profile) {
    return { success: false, error: "Profile not found" };
  }

  // Role is always 'lead'. co-organizer was abolished as a distinct role, and hosting_venue is
  // an admin-side concept, so this form never offers a choice.
  const { error: insertError } = await supabase
    .from("event_organizers")
    .insert({ event_id: eventId, organizer_id: profileId, role: "lead" });

  if (insertError) {
    // UNIQUE(event_id, organizer_id): say what happened rather than leaking the constraint.
    if (insertError.code === "23505") {
      return { success: false, error: `${profile.name} is already listed as an organizer.` };
    }
    return { success: false, error: insertError.message };
  }

  revalidatePath("/dashboard");
  return { success: true };
}

export async function removeOrganizer(
  eventId: string,
  profileId: string,
): Promise<TeacherActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { success: false, error: "Not signed in" };
  if (!(await canManageOrganizers(supabase, eventId, user))) {
    return { success: false, error: "Only the event's owner can change who is organizing it." };
  }

  // An event with no organizer credit at all renders an "unclaimed organizer" state on its
  // public page, so don't let the list be emptied from here. Handing an event over means
  // adding the new organizer first, then stepping back.
  const { count } = await supabase
    .from("event_organizers")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId)
    .not("organizer_id", "is", null);

  if ((count ?? 0) <= 1) {
    return { success: false, error: "An event needs at least one organizer. Add another before removing this one." };
  }

  const { error: deleteError } = await supabase
    .from("event_organizers")
    .delete()
    .eq("event_id", eventId)
    .eq("organizer_id", profileId);

  if (deleteError) {
    return { success: false, error: deleteError.message };
  }

  revalidatePath("/dashboard");
  return { success: true };
}
