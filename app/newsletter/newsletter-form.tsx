"use client";

import { Turnstile } from "@marsidev/react-turnstile";
import { useState, useTransition } from "react";

import { subscribeFromForm, type NewsletterFormResult } from "./actions";

const MESSAGES: Record<NewsletterFormResult, { text: string; ok: boolean }> = {
  // Double opt-in is invisible unless we say so (I-160 spec): about one in four signups on the old
  // embed never confirmed.
  pending: {
    text: "Almost done! We sent you an email. Click the button in it to confirm your subscription. If it is not there in a few minutes, check your spam folder.",
    ok: true,
  },
  already: {
    text: "This address is already on our list. If you never confirmed it, look for our confirmation email in your inbox or spam folder.",
    ok: true,
  },
  invalid: { text: "That does not look like an email address. Please check it and try again.", ok: false },
  challenge_failed: { text: "The spam check did not go through. Please reload the page and try again.", ok: false },
  rate_limited: { text: "Too many signups from this connection today. Please try again tomorrow.", ok: false },
  error: { text: "Something went wrong on our side. Please try again later, or email hello@citreasurehunt.com.", ok: false },
};

export function NewsletterForm() {
  const siteKey = process.env.NEXT_PUBLIC_CF_TURNSTILE_SITE_KEY;
  const [email, setEmail] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [widgetKey, setWidgetKey] = useState(0);
  const [result, setResult] = useState<NewsletterFormResult | null>(null);
  const [pending, startTransition] = useTransition();

  const done = result === "pending" || result === "already";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    startTransition(async () => {
      const res = await subscribeFromForm(email, token);
      setResult(res);
      // A Turnstile token is single-use; get a fresh one for the next attempt.
      setToken(null);
      setWidgetKey((k) => k + 1);
    });
  }

  if (done && result) {
    return <p className="text-base leading-7 text-emerald-800">{MESSAGES[result].text}</p>;
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
        Email
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full rounded-2xl border border-(--color-sand-strong) bg-white px-4 py-3 text-base text-slate-950 outline-none transition focus:border-(--color-pine)"
        />
      </label>
      {siteKey ? (
        <Turnstile key={widgetKey} siteKey={siteKey} onSuccess={setToken} onExpire={() => setToken(null)} options={{ theme: "light" }} />
      ) : null}
      <button
        type="submit"
        disabled={pending || !token || !email}
        className="rounded-full bg-(--color-ink) px-5 py-3 text-sm font-semibold text-(--color-mist) disabled:opacity-50"
      >
        {pending ? "Subscribing…" : "Subscribe"}
      </button>
      {result && !done ? <p className="text-sm text-rose-700">{MESSAGES[result].text}</p> : null}
    </form>
  );
}
