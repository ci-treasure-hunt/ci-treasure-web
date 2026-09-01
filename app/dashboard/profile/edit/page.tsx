import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProfileEditForm } from "./profile-edit-form";

import { getEntityEmail } from "@/lib/entity-email";
export default async function ProfileEditPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth?next=/dashboard/profile/edit");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile) {
    redirect("/dashboard");
  }

  // I-165 F3: the address lives in entity_emails now, so select("*") no longer carries it. Safe to
  // read here without a further check: the query above is scoped by .eq("user_id", user.id), so
  // this is by construction the signed-in user's own profile and their own address.
  const publicEmail = await getEntityEmail("profile", profile.id);

  // Roles backed by real event links are locked on (can't be unchecked here) so the checkbox
  // never contradicts the junction-table data — see event_organizers/event_teachers below.
  const [{ data: organizerLinks }, { data: teacherLinks }] = await Promise.all([
    supabase.from("event_organizers").select("id").eq("organizer_id", profile.id).limit(1),
    supabase.from("event_teachers").select("role").eq("teacher_id", profile.id),
  ]);

  const lockedOrganizer = Boolean(organizerLinks?.length);
  const lockedMusician = Boolean(teacherLinks?.some((t) => t.role === "musician"));
  const lockedTeacher = Boolean(teacherLinks?.some((t) => t.role !== "musician"));

  return (
    <main className="min-h-screen bg-(--color-mist) px-5 py-10 text-slate-900 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-3xl">
        <Link href="/dashboard" className="text-sm font-medium text-(--color-pine) hover:underline">
          ← Back to dashboard
        </Link>
        <div className="mt-4">
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-(--color-pine)">Profile</p>
          <h1 className="mt-2 font-serif text-4xl text-slate-950">Edit profile</h1>
          <p className="mt-3 text-base leading-7 text-slate-700">
            Keep your public profile up to date. Changes are saved immediately.
          </p>
        </div>
        <div className="mt-8">
          <ProfileEditForm
            profile={{ ...profile, public_email: publicEmail }}
            lockedRoles={{ organizer: lockedOrganizer, teacher: lockedTeacher, musician: lockedMusician }}
            isDeactivated={profile.visibility === "deactivated"}
            deletionRequested={Boolean(profile.deletion_requested_at)}
          />
        </div>
      </div>
    </main>
  );
}
