"use client";

import { useState } from "react";

import { explainOAuthError } from "@/lib/auth-errors";
import { createClient } from "@/lib/supabase/client";

// The third way in, alongside the magic link and the typed code. It sidesteps both of the things
// that break the email flow: there is no email to open in the wrong app, and no single-use token
// for a security scanner to burn. Cookies are still required, because the session lands in one
// either way.
//
// Browser client, not a server action: signInWithOAuth has to write the PKCE code_verifier cookie
// into this browser before sending it to Google, and it is this browser that Google sends back.
export function GoogleButton({ next }: { next: string }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signIn() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        // /auth/callback, not /auth/confirm: the confirm page gates on a button press to defeat
        // email scanners, which an OAuth redirect has no need of.
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    // Only reached if the redirect never happened. On success the browser has already left.
    if (oauthError) {
      setError(explainOAuthError(oauthError.message));
      setBusy(false);
    }
  }

  return (
    <div className="mt-6">
      <button
        type="button"
        onClick={signIn}
        disabled={busy}
        className="flex w-full items-center justify-center gap-3 rounded-full border border-(--color-sand-strong) bg-white px-5 py-3 text-sm font-semibold text-slate-800 transition hover:border-(--color-pine) disabled:opacity-50 sm:w-auto"
      >
        <svg aria-hidden="true" viewBox="0 0 18 18" className="h-[18px] w-[18px]">
          <path
            fill="#4285F4"
            d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
          />
          <path
            fill="#34A853"
            d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.83.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
          />
          <path
            fill="#FBBC05"
            d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3-2.33Z"
          />
          <path
            fill="#EA4335"
            d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
          />
        </svg>
        {busy ? "Opening Google..." : "Continue with Google"}
      </button>
      {error ? <p className="mt-3 text-sm leading-6 text-rose-700">{error}</p> : null}
    </div>
  );
}
