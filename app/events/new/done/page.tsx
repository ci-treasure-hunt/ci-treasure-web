import type { Metadata } from "next";
import Link from "next/link";

import { supportHref } from "@/lib/support";
import { TELEGRAM_URL } from "@/lib/site";

// I-192 stage 3: the end of a shared submission, and the two ways a claim link can fail.
export const metadata: Metadata = {
  title: "Thank you — CI Treasure Hunt",
  robots: { index: false, follow: false },
};

const STATES = {
  thanks: {
    title: "Thank you!",
    body: "We check every event by hand, add the details and publish it, usually within a day or two.",
  },
  expired: {
    title: "This link has expired",
    body: "Your event is saved and we'll look at it. If you organize or teach at it and want to manage it yourself, write to hello@citreasurehunt.com and we'll connect it to your account.",
  },
  taken: {
    title: "Someone else manages this event",
    body: "Another account has already taken this event over. If that's a mistake, write to hello@citreasurehunt.com.",
  },
} as const;

export default async function DonePage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; newsletter?: string }>;
}) {
  const { state, newsletter } = await searchParams;
  const content = STATES[(state as keyof typeof STATES) ?? "thanks"] ?? STATES.thanks;

  return (
    <main className="min-h-screen bg-(--color-mist) px-5 py-10 text-slate-900 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-2xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="font-serif text-3xl tracking-tight text-slate-950">{content.title}</h1>
        <p className="mt-3 text-base text-slate-700">{content.body}</p>
        {newsletter === "pending" ? (
          <p className="mt-3 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            One more step for the newsletter: we sent you an email. Click the button in it to confirm.
          </p>
        ) : null}
        {state !== "taken" && state !== "expired" ? (
          <p className="mt-3 text-sm text-slate-600">
            New events are announced in our{" "}
            <a href={TELEGRAM_URL} target="_blank" rel="noreferrer" className="font-medium text-(--color-pine) underline">
              Telegram group
            </a>
            , and in the{" "}
            <Link href="/newsletter" className="font-medium text-(--color-pine) underline">
              newsletter
            </Link>
            . Listing is free, and it stays free; if CI Treasure Hunt helps you,{" "}
            <Link href={supportHref("submit")} className="font-medium text-(--color-pine) underline">
              you can support it here
            </Link>
            .
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap gap-4">
          <Link href="/events/new" className="text-sm font-semibold text-(--color-pine) underline">
            Add another event
          </Link>
          <Link href="/" className="text-sm font-semibold text-(--color-pine) underline">
            Back to all events
          </Link>
        </div>
      </div>
    </main>
  );
}
