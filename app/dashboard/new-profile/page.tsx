import Link from "next/link";
import { redirect } from "next/navigation";

import { safeNext } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";

import { NewProfileForm } from "./new-profile-form";

// I-192 stage 3: ?next= returns to an event claim (/events/new/claim?...) once the profile exists,
// so a signed-out organizer or teacher who just submitted an event ends up linked to it. Only that
// path is honoured; anything else falls back to the usual profile edit screen.
function claimNext(raw: string | undefined): string | null {
  const next = safeNext(raw, "");
  return next.startsWith("/events/new/claim?") ? next : null;
}

export default async function NewProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const next = claimNext((await searchParams).next);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/auth?next=${encodeURIComponent(next ? `/dashboard/new-profile?next=${encodeURIComponent(next)}` : "/dashboard/new-profile")}`);
  }
  const { data: owned } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (owned) {
    redirect(next ?? "/dashboard");
  }

  return (
    <main className="min-h-screen bg-(--color-mist) px-5 py-10 text-slate-900 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-2xl">
        <Link href="/dashboard" className="text-sm font-medium text-(--color-pine) hover:underline">
          ← Back to dashboard
        </Link>
        <div className="mt-4 rounded-[1.75rem] border border-white/80 bg-white/90 p-8 shadow-[0_18px_55px_rgba(106,75,25,0.08)]">
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-(--color-pine)">Not listed yet</p>
          <h1 className="mt-3 font-serif text-4xl text-slate-950">Create your profile</h1>
          <p className="mt-4 text-base leading-7 text-slate-700">
            Add your profile so you can submit and manage events. It&apos;s reviewed before it appears in the
            public directory, but you can start using your dashboard right away.
          </p>
          <p className="mt-2 text-sm text-slate-600">
            Think you might already be listed?{" "}
            <Link href="/dashboard/claim" className="font-semibold text-(--color-pine) underline">
              Search instead
            </Link>
            .
          </p>
          <div className="mt-8">
            <NewProfileForm next={next} />
          </div>
        </div>
      </div>
    </main>
  );
}
