import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { verifyEventSubmitTicket } from "@/lib/event-submit-ticket";

import { WhoChoice } from "./who-choice";

// I-192 stage 3, step 2, signed out only: the event is already saved as pending. Organizer or
// teacher → sign in and claim it (/events/new/claim). Just sharing → optional email, done.
export const metadata: Metadata = {
  title: "Your event is saved — CI Treasure Hunt",
  robots: { index: false, follow: false },
};

export default async function WhoPage({
  searchParams,
}: {
  searchParams: Promise<{ e?: string; t?: string; title?: string }>;
}) {
  const { e = "", t = "", title = "" } = await searchParams;
  if (!verifyEventSubmitTicket(e, t)) redirect("/events/new/done?state=expired");

  return (
    <main className="min-h-screen bg-(--color-mist) px-5 py-10 text-slate-900 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 border-l-4 border-(--color-pine) py-1 pl-5">
          <p className="text-sm font-semibold text-(--color-pine)">Saved</p>
          <h1 className="font-serif text-3xl tracking-tight text-slate-950 sm:text-4xl">{title.slice(0, 200) || "Your event"}</h1>
          <p className="mt-2 text-base text-slate-600">One more question: who are you for this event?</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <WhoChoice eventId={e} ticket={t} />
        </div>
      </div>
    </main>
  );
}
