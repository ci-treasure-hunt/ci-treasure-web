"use client";

import { useState, useTransition } from "react";

import type { NewsletterResult } from "@/lib/newsletter";

import { declineNewsletter, resendConfirmation } from "./newsletter-actions";

// Shown while the account subscribed but EmailOctopus still has the address as pending
// (needsNewsletterConfirmation in ./newsletter.ts). A notice on our own site, not an email, so it
// can ask as often as the person visits; "No thanks" ends it for good.
export function NewsletterReminder({ email }: { email: string }) {
  const [result, setResult] = useState<NewsletterResult | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <section className="rounded-[1.75rem] border border-(--color-sand-strong) bg-white/90 p-6 shadow-[0_18px_55px_rgba(106,75,25,0.08)]">
      <h2 className="font-serif text-xl text-slate-950">Please confirm your newsletter subscription</h2>
      {result === "pending" ? (
        <p className="mt-2 text-sm leading-6 text-emerald-800">
          Sent! A new confirmation email is on its way to {email}. Click the button in it, and you are in.
        </p>
      ) : result === "already" ? (
        <p className="mt-2 text-sm leading-6 text-slate-700">
          We sent it just a few minutes ago. Please give it a moment, and check your spam folder too.
        </p>
      ) : (
        <>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            We sent a confirmation email to {email} from newsletter@citreasurehunt.com. If it is not in your
            inbox, check your spam folder. Or we can send you a new one.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={pending}
              onClick={() => startTransition(async () => setResult(await resendConfirmation()))}
              className="rounded-full bg-(--color-ink) px-5 py-2.5 text-sm font-semibold text-(--color-mist) disabled:opacity-50"
            >
              Send it again
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
        </>
      )}
    </section>
  );
}
