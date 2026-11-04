import type { Metadata } from "next";
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";

import { VenueSubmitForm } from "./venue-submit-form";

// I-192 stage 2 (2026-11-04): open without sign-in, so the page has its own metadata now (it used
// to redirect signed-out visitors, and the preview came from app/auth/page.tsx).
export const metadata: Metadata = {
  title: "Add a venue — CI Treasure Hunt",
  description:
    "Add a studio, retreat centre or dance house where Contact Improvisation happens to CI Treasure Hunt, so organizers can pick it for their events.",
  alternates: { canonical: "https://citreasurehunt.com/venues/new" },
};

export default async function NewVenuePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="min-h-screen bg-(--color-mist)">
      <section className="mx-auto w-full max-w-2xl px-5 py-10 sm:px-8">
        <Link href="/venues" className="text-sm font-medium text-(--color-pine) hover:underline">
          ← All venues
        </Link>
        <div className="mt-4 mb-8 border-l-4 border-(--color-pine) py-1 pl-5">
          <h1 className="font-serif text-3xl tracking-tight text-slate-950 sm:text-4xl">Add a venue</h1>
          <p className="mt-2 text-base text-slate-500">
            A studio, retreat centre or dance house where Contact Improvisation happens, and that isn&apos;t listed yet.
            Once it&apos;s in, organizers can pick it for their events instead of typing the address.
          </p>
          <p className="mt-2 text-sm text-slate-500">
            We look at every venue by hand. Venues with a website and a photo get their own page; the others are on the
            map with the events held there.
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <VenueSubmitForm signedIn={Boolean(user)} />
        </div>
      </section>
    </main>
  );
}
