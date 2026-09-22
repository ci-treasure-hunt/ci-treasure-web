import { type EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

import { explainConfirmError } from "@/lib/auth-errors";
// I-165: safeNext lives in lib/site.ts and is shared with app/auth/page.tsx and
// app/admin/login/page.tsx. Only site-relative redirect targets survive.
import { safeNext } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";

// This was a route.ts that verified the token on the GET request itself and redirected. It is a
// page now, for two reasons (both 2026-09-22):
//
// 1. Automated email security scanners (Outlook Safe Links, Mimecast, Proofpoint and others)
//    pre-fetch every link in an email before it reaches the inbox. A GET that consumes a
//    single-use token therefore gets burned by the scanner, and the real person's click then
//    fails with no explanation. Scanners issue GETs; they do not submit forms. Putting the
//    verification behind an explicit button press defeats that specific failure, at the cost of
//    one extra tap for a genuine sign-in.
//
// 2. The old route never checked the error returned by exchangeCodeForSession or verifyOtp. A
//    failed exchange still redirected to `next` as though it had worked, so the person landed on
//    a page, was silently treated as signed out, and got bounced back to /auth with nothing
//    explaining why. Every failure path here now carries a specific reason.
//
// The old "neither param present" fallback also sent everyone to /admin/login regardless of
// whether they were an admin, which read as broken to any organizer who hit it. All failures now
// go back to /auth, which preserves `next` and can send an admin onward correctly once they do
// sign in.

async function completeSignIn(formData: FormData) {
  "use server";

  const next = safeNext(String(formData.get("next") ?? ""));
  const code = String(formData.get("code") ?? "");
  const tokenHash = String(formData.get("token_hash") ?? "");
  const type = String(formData.get("type") ?? "");

  const failTo = (message: string) =>
    `/auth?error=${encodeURIComponent(message)}&next=${encodeURIComponent(next)}`;

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) redirect(failTo(explainConfirmError(error.message)));
    redirect(next);
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type: type as EmailOtpType,
      token_hash: tokenHash,
    });
    if (error) redirect(failTo(explainConfirmError(error.message)));
    redirect(next);
  }

  redirect(failTo(explainConfirmError(null)));
}

export default async function AuthConfirmPage({
  searchParams,
}: {
  searchParams?: Promise<{
    code?: string;
    token_hash?: string;
    type?: string;
    next?: string;
    error?: string;
    error_description?: string;
  }>;
}) {
  const params = (await searchParams) ?? {};
  const next = safeNext(params.next);

  // Already signed in: a second click on a spent link, or this page reloaded after the action
  // below already succeeded. Nothing left to confirm.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    redirect(next);
  }

  // GoTrue appends error/error_description when its own /verify step fails, before the token
  // could ever reach us as a usable code or token_hash. Usually means it was already consumed.
  if (params.error || params.error_description) {
    redirect(
      `/auth?error=${encodeURIComponent(
        explainConfirmError(params.error_description ?? params.error),
      )}&next=${encodeURIComponent(next)}`,
    );
  }

  if (!params.code && !(params.token_hash && params.type)) {
    redirect(
      `/auth?error=${encodeURIComponent(explainConfirmError(null))}&next=${encodeURIComponent(next)}`,
    );
  }

  return (
    <main className="min-h-screen bg-(--color-mist) px-5 py-10 text-slate-900 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-2xl rounded-[1.75rem] border border-white/80 bg-white/90 p-8 shadow-[0_18px_55px_rgba(106,75,25,0.08)]">
        <p className="text-sm font-semibold uppercase tracking-[0.28em] text-(--color-pine)">Sign in</p>
        <h1 className="mt-3 font-serif text-4xl text-slate-950">Finish signing in</h1>
        <p className="mt-4 text-base leading-7 text-slate-700">
          One more step. Click the button to complete sign-in in this browser.
        </p>
        <form action={completeSignIn} className="mt-8">
          <input type="hidden" name="next" value={next} />
          <input type="hidden" name="code" value={params.code ?? ""} />
          <input type="hidden" name="token_hash" value={params.token_hash ?? ""} />
          <input type="hidden" name="type" value={params.type ?? ""} />
          <button
            type="submit"
            className="rounded-full bg-(--color-ink) px-5 py-3 text-sm font-semibold text-(--color-mist)"
          >
            Finish signing in
          </button>
        </form>
        <p className="mt-6 text-sm leading-6 text-slate-500">
          This needs to be the same browser you used to request the link, with cookies allowed for
          this site. If it does not work, request a new link and use the numbered code from the
          email instead.
        </p>
      </div>
    </main>
  );
}
