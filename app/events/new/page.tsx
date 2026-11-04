import type { Metadata } from "next";
import Link from "next/link";

import { EventStep1Form } from "@/components/organizer/event-step1-form";
import { getKnownDisciplines } from "@/lib/events";
import { createClient } from "@/lib/supabase/server";

// I-192 stage 3 (2026-11-04): open to everyone. Step 1 of three: the essentials, saved as pending
// before any sign-in. It used to require sign-in and an own profile first and showed the long
// form; that long form is now step 3, the edit page.
export const metadata: Metadata = {
  title: "Add an event — CI Treasure Hunt",
  description:
    "Add a Contact Improvisation workshop, lab, jam, festival or class to CI Treasure Hunt. Organizers, teachers and dancers passing an event on are all welcome.",
  alternates: { canonical: "https://citreasurehunt.com/events/new" },
};

export default async function NewEventPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let hasProfile = false;
  if (user) {
    const { data: profile } = await supabase.from("profiles").select("id").eq("user_id", user.id).maybeSingle();
    hasProfile = Boolean(profile);
  }

  const availablePractices = await getKnownDisciplines();

  return (
    <main className="min-h-screen bg-(--color-mist) px-5 py-10 text-slate-900 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-2xl">
        <Link href="/" className="text-sm font-medium text-(--color-pine) hover:underline">
          ← All events
        </Link>
        <div className="mt-4 mb-8 border-l-4 border-(--color-pine) py-1 pl-5">
          <h1 className="font-serif text-3xl tracking-tight text-slate-950 sm:text-4xl">Add an event</h1>
          <p className="mt-2 text-base text-slate-600">
            Organizing it, teaching at it, or just passing it on: all welcome. Start with the essentials, it takes a
            minute.
          </p>
          {!user ? (
            <p className="mt-2 text-sm text-slate-500">
              Already have an account?{" "}
              <Link href="/auth?next=/events/new" className="font-medium text-(--color-pine) underline">
                Sign in
              </Link>{" "}
              first to manage the event yourself.
            </p>
          ) : null}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <EventStep1Form availablePractices={availablePractices} mode={{ signedIn: Boolean(user), hasProfile }} />
        </div>
      </div>
    </main>
  );
}
