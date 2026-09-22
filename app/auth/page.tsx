import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { CookieCheck } from "@/components/auth/cookie-check";
import { OtpCodeForm } from "@/components/auth/otp-code-form";
import { createClient } from "@/lib/supabase/server";
// I-165: was a local SAFE_NEXT regex that missed "/\host". Shared with app/auth/confirm/page.tsx
// and app/admin/login/page.tsx.
import { safeNext, SITE_OG_IMAGE, SITE_URL } from "@/lib/site";

// The share card for every auth-gated URL is generated here, not on the page being linked to.
// An anonymous request for /events/new 307s straight to /auth?next=/events/new before that page
// renders, so a link-preview fetcher never sees the target's own metadata and putting it there
// would do nothing. This page had none at all, so it inherited the homepage's title and
// description wholesale (Next.js does not deep-merge nested metadata keys — the same gap fixed
// on /teachers, /venues and /communities in I-150), and a link to the submission form previewed
// as the homepage.
const DESTINATION_META: Record<string, { title: string; description: string }> = {
  "/events/new": {
    title: "Submit an event",
    description:
      "Add a Contact Improvisation workshop, lab, jam gathering or festival to CI Treasure Hunt. One-day and multi-day events both welcome.",
  },
};

const DEFAULT_META = {
  title: "Sign in",
  description:
    "Sign in to claim your profile, edit your bio, photo and links, and submit events to CI Treasure Hunt.",
};

export async function generateMetadata({
  searchParams,
}: {
  searchParams?: Promise<{ next?: string }>;
}): Promise<Metadata> {
  const params = (await searchParams) ?? {};
  // safeNext, not the raw param: this ends up in the rendered page, and the same open-redirect
  // shape I-165 closed for the form target applies to anything derived from it.
  const meta = DESTINATION_META[safeNext(params.next)] ?? DEFAULT_META;
  return {
    title: meta.title,
    description: meta.description,
    // robots.ts already disallows /auth for "*", so this is belt and braces rather than the
    // mechanism: it only matters if a fetcher with its own allow group also indexes.
    robots: { index: false, follow: false },
    openGraph: {
      title: meta.title,
      description: meta.description,
      url: `${SITE_URL}/auth`,
      siteName: "CI Treasure Hunt",
      type: "website",
      images: [{ url: SITE_OG_IMAGE, width: 1280, height: 1024, type: "image/jpeg" }],
    },
    twitter: {
      card: "summary_large_image",
      title: meta.title,
      description: meta.description,
      images: [SITE_OG_IMAGE],
    },
  };
}

async function sendMagicLink(formData: FormData) {
  "use server";

  const email = String(formData.get("email") ?? "").trim();
  const next = safeNext(String(formData.get("next") ?? ""));

  if (!email) {
    redirect(`/auth?error=${encodeURIComponent("Enter an email address.")}&next=${encodeURIComponent(next)}`);
  }

  const headerStore = await headers();
  const origin = headerStore.get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${origin}/auth/confirm?next=${encodeURIComponent(next)}`,
    },
  });

  if (error) {
    redirect(`/auth?error=${encodeURIComponent(error.message)}&next=${encodeURIComponent(next)}`);
  }

  redirect(`/auth?sent=1&email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`);
}

export default async function AuthPage({
  searchParams,
}: {
  searchParams?: Promise<{ next?: string; sent?: string; email?: string; error?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const next = safeNext(params.next);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    redirect(next);
  }

  const sentEmail = params.sent === "1" ? params.email ?? "" : "";
  const errorMessage = params.error ?? "";

  return (
    <main className="min-h-screen bg-(--color-mist) px-5 py-10 text-slate-900 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-2xl rounded-[1.75rem] border border-white/80 bg-white/90 p-8 shadow-[0_18px_55px_rgba(106,75,25,0.08)]">
        <p className="text-sm font-semibold uppercase tracking-[0.28em] text-(--color-pine)">Sign in</p>
        <h1 className="mt-3 font-serif text-4xl text-slate-950">Manage your profile and events</h1>
        <p className="mt-4 text-base leading-7 text-slate-700">
          Enter your email and we&apos;ll send you a magic link. Open it to sign in — no password needed. Once
          you&apos;re in, you can claim your profile (update your bio, photo, and links), edit your listed
          events, and submit new ones.
        </p>
        <p className="mt-4 rounded-2xl bg-(--color-mist) px-4 py-3 text-sm leading-6 text-slate-600">
          Two things this needs, worth knowing before you start. Open the link in the same browser
          you used to request it, and allow first-party cookies for this site. On phones the email
          app often opens links in a different browser than the one you started in, which stops
          sign-in from completing. If that happens, come back to this tab and use the numbered code
          from the email instead.
        </p>

        <CookieCheck />

        {sentEmail ? (
          <p className="mt-4 text-sm text-emerald-700">
            Magic link sent to {sentEmail}. Check your inbox (and spam) — the link signs you in.
          </p>
        ) : null}
        {errorMessage ? <p className="mt-4 text-sm text-rose-700">{errorMessage}</p> : null}

        {sentEmail ? <OtpCodeForm email={sentEmail} next={next} /> : null}

        <form action={sendMagicLink} className="mt-8 space-y-4">
          <input type="hidden" name="next" value={next} />
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium text-slate-700">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="w-full rounded-2xl border border-(--color-sand-strong) bg-white px-4 py-3 text-base text-slate-950 outline-none ring-0 transition focus:border-(--color-pine)"
              placeholder="you@example.com"
            />
          </div>
          <button
            type="submit"
            className="rounded-full bg-(--color-ink) px-5 py-3 text-sm font-semibold text-(--color-mist)"
          >
            Send magic link
          </button>
        </form>
      </div>
    </main>
  );
}
