"use client";

import { useState, useTransition } from "react";

import type { NewsletterResult } from "@/lib/newsletter";

import { declineNewsletter, subscribeMe } from "./newsletter-actions";

// I-160 rider: one-click newsletter offer for signed-in users who have not answered yet. The
// address is the account's own, already proven by sign-in, so there is no form and no Turnstile.
export function NewsletterOffer({ email }: { email: string }) {
  const [result, setResult] = useState<NewsletterResult | null>(null);
  const [pending, startTransition] = useTransition();

  if (result === "pending") {
    return (
      <Shell>
        <p className="text-sm text-emerald-800">
          Almost done! We sent an email to {email}. Click the button in it to confirm your subscription.
        </p>
      </Shell>
    );
  }
  if (result === "already") {
    return (
      <Shell>
        <p className="text-sm text-emerald-800">{email} is already on our list. Thank you!</p>
      </Shell>
    );
  }

  return (
    <Shell>
      <h2 className="font-serif text-xl text-slate-950">Get the monthly newsletter?</h2>
      <p className="mt-2 text-sm leading-6 text-slate-700">
        New events, communities and features, once a month, to {email}. You confirm it once by email and can
        unsubscribe any time.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(async () => setResult(await subscribeMe()))}
          className="rounded-full bg-(--color-ink) px-5 py-2.5 text-sm font-semibold text-(--color-mist) disabled:opacity-50"
        >
          Subscribe
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(async () => declineNewsletter())}
          className="rounded-full border border-(--color-sand-strong) px-5 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-50"
        >
          No thanks
        </button>
      </div>
      {result === "invalid" || result === "error" ? (
        <p className="mt-3 text-sm text-rose-700">That did not work. Please try again later.</p>
      ) : null}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-[1.75rem] border border-(--color-sand-strong) bg-white/90 p-6 shadow-[0_18px_55px_rgba(106,75,25,0.08)]">
      {children}
    </section>
  );
}
