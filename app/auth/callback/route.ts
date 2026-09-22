import { NextResponse, type NextRequest } from "next/server";

import { explainOAuthError } from "@/lib/auth-errors";
import { safeNext } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";

// OAuth's callback, deliberately separate from /auth/confirm.
//
// /auth/confirm puts verification behind a button press because email links get pre-fetched by
// security scanners, and a GET that consumes a single-use token gets burned before the person
// clicks. None of that applies here: an OAuth code is issued by Google directly to the browser
// that started the flow, as part of a redirect chain that browser is already following. Nothing
// pre-fetches it, so the extra click would be friction with no benefit.
//
// The PKCE verifier is written by the browser client in google-button.tsx and read back here by
// the server client. Both go through the same cookie store, which is the whole reason
// @supabase/ssr keeps sessions in cookies rather than localStorage.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNext(searchParams.get("next"));

  // Google's own refusals (consent denied, app misconfigured) arrive as error params, not as a
  // code. Surface them rather than redirecting to a page that will just bounce back.
  const oauthError = searchParams.get("error_description") ?? searchParams.get("error");
  const code = searchParams.get("code");

  // Behind Vercel's proxy request.url carries the internal host, so an absolute redirect built
  // from it can land on a URL the browser cannot resolve. x-forwarded-host is the public one.
  const forwardedHost = request.headers.get("x-forwarded-host");
  const base = process.env.NODE_ENV === "development" || !forwardedHost
    ? origin
    : `https://${forwardedHost}`;

  const failTo = (message: string) =>
    NextResponse.redirect(
      `${base}/auth?error=${encodeURIComponent(message)}&next=${encodeURIComponent(next)}`,
    );

  if (oauthError) return failTo(explainOAuthError(oauthError));
  if (!code) return failTo(explainOAuthError(null));

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return failTo(explainOAuthError(error.message));

  return NextResponse.redirect(`${base}${next}`);
}
