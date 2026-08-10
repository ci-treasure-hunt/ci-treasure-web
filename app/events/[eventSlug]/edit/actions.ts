"use server";

import { revalidatePath } from "next/cache";

import { isAdminEmail } from "@/lib/admin-auth";
import { sendEmail } from "@/lib/email";
import { buildEventSlug } from "@/lib/events";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyAdminTeacherAdded } from "@/app/events/actions";

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

  const { data: teacher, error: fetchTeacherError } = await supabase
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
