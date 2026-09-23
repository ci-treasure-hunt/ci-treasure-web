import type { Metadata } from "next";

import { CommunitySubmitForm } from "./community-submit-form";

export const metadata: Metadata = {
  title: "Add a community — CI Treasure Hunt",
  description:
    "Add a Contact Improvisation community, jam series, festival or collective to the CI Treasure Hunt directory. No account needed; every submission is reviewed by hand.",
};

export default function NewCommunityPage() {
  return (
    <main className="min-h-screen bg-(--color-mist)">
      <section className="mx-auto w-full max-w-2xl px-5 py-10 sm:px-8">
        <div className="mb-8 border-l-4 border-(--color-pine) py-1 pl-5">
          <h1 className="font-serif text-3xl tracking-tight text-slate-950 sm:text-4xl">Add a community</h1>
          <p className="mt-2 text-base text-slate-500">
            Know a CI community, jam series, festival or collective that isn&apos;t listed yet? Add it here. No account
            needed, and we review every submission by hand before it goes live.
          </p>
          <p className="mt-2 text-sm text-slate-500">
            If you&apos;re not an organizer or admin of the community, please send them a short note that you&apos;ve listed it.
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <CommunitySubmitForm />
        </div>
      </section>
    </main>
  );
}
