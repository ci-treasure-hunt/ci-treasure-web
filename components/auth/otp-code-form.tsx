"use client";

import { useState } from "react";

import { explainConfirmError } from "@/lib/auth-errors";
import { createClient } from "@/lib/supabase/client";

// The way out of the "link opened in a different browser" trap, which is structural rather than a
// bug: @supabase/ssr defaults to the PKCE flow, so requesting a link stores a code_verifier cookie
// in the requesting browser, and only that browser can complete the exchange. On mobile the email
// app routinely opens links in its own browser, and an installed PWA has storage separate from the
// browser outside it, so the verifier is simply not there and no amount of error handling can
// recover it.
//
// Typing the code sidesteps all of that: verifyOtp checks the code against Supabase directly, with
// no local secret involved, and it runs in the tab the person already has open. Nothing has to be
// handed between apps at all. This is what Slack, Notion and Linear do for the same reason.
//
// Uses the browser client deliberately, not a server action: @supabase/ssr's browser client writes
// the session to cookies (not localStorage) precisely so middleware and server components read the
// same session, so the session lands in this tab directly.
export function OtpCodeForm({ email, next }: { email: string; next: string }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const token = code.trim();
    if (!token) return;

    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email,
        token,
        type: "email",
      });
      if (verifyError) {
        setError(explainConfirmError(verifyError.message));
        setBusy(false);
        return;
      }
      // Hard navigation, not router.push: the middleware and every server component need to see
      // the freshly written session cookie, and a soft navigation can render from a cache that
      // predates it.
      window.location.href = next;
    } catch {
      setError(explainConfirmError(null));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-3">
      <label htmlFor="otp-code" className="block text-sm font-medium text-slate-700">
        Or enter the code from the email
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <input
          id="otp-code"
          name="otp-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="123456"
          className="w-40 rounded-2xl border border-(--color-sand-strong) bg-white px-4 py-3 text-base tracking-[0.3em] text-slate-950 outline-none ring-0 transition focus:border-(--color-pine)"
        />
        <button
          type="submit"
          disabled={busy || !code.trim()}
          className="rounded-full bg-(--color-ink) px-5 py-3 text-sm font-semibold text-(--color-mist) disabled:opacity-50"
        >
          {busy ? "Checking..." : "Confirm code"}
        </button>
      </div>
      <p className="text-sm leading-6 text-slate-500">
        Use this if the link does not work, for example when your email app opens it in a different
        browser. The code works in this tab.
      </p>
      {error ? <p className="text-sm leading-6 text-rose-700">{error}</p> : null}
    </form>
  );
}
