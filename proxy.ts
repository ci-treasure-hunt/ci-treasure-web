import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { isAdminEmail } from "@/lib/admin-emails";

export async function proxy(request: NextRequest) {
  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  // Always refresh the session for matched routes (writes refreshed cookies to `response`).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // ── Admin area: gate on ADMIN_EMAIL ──────────────────────────────────────
  if (pathname.startsWith("/admin")) {
    const isLoginPage = pathname === "/admin/login";
    const isForbiddenPage = pathname === "/admin/forbidden";
    const isAdmin = isAdminEmail(user?.email);

    if (!user && !isLoginPage) {
      const loginUrl = new URL("/admin/login", request.url);
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }

    if (user && !isAdmin && !isForbiddenPage) {
      return NextResponse.redirect(new URL("/admin/forbidden", request.url));
    }

    if (user && isAdmin && isLoginPage) {
      return NextResponse.redirect(new URL("/admin/events", request.url));
    }

    return response;
  }

  // ── Organizer area: require any authenticated user ───────────────────────
  // /dashboard, /events/[slug]/edit. No admin/forbidden gate —
  // any signed-in user may manage their own claimed events.
  // /venues/new left this list with I-192 stage 2 (2026-11-04): open without sign-in, like
  // /communities/new; /events/new with stage 3.
  if (!user) {
    const loginUrl = new URL("/auth", request.url);
    // Include the search string, not just pathname — /dashboard/claim?profile=<id>
    // (I-118's deep-link claim CTA) must survive the sign-in round trip.
    loginUrl.searchParams.set("next", pathname + request.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  // /events/new left with I-192 stage 3 (2026-11-04): step 1 is open to everyone. Careful: the
  // ":eventSlug" pattern below must not match "new/claim" or "new/who" (it is one segment + /edit).
  matcher: ["/admin/:path*", "/dashboard/:path*", "/events/:eventSlug/edit"],
};
