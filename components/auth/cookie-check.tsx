"use client";

import { useSyncExternalStore } from "react";

// Warns before the round trip rather than after it. Sign-in is cookie-based, so a browser with
// cookies blocked cannot hold a session no matter what happens at the Supabase end: the token is
// validated fine, the Set-Cookie is discarded, and the person is bounced straight back here with
// nothing to explain it. That failure leaves no trace in any server log, which is exactly why it
// went unexplained for so long (2026-09-22). Cheaper to tell them up front than to let them send
// an email to themselves and discover it two clicks later.

// Computed once and cached at module scope. useSyncExternalStore calls getSnapshot on every
// render and compares with Object.is, so the probe itself must not run there: writing a cookie
// per render would be a side effect during render, and returning a freshly computed value risks
// an update loop. Caching makes the snapshot stable.
let cachedBlocked: boolean | null = null;

function cookiesBlocked(): boolean {
  if (cachedBlocked !== null) return cachedBlocked;
  // navigator.cookieEnabled alone lies in a few browsers (it reports true while storage is
  // actually blocked or partitioned), so write one and read it back.
  try {
    document.cookie = "ci-cookie-test=1; path=/; max-age=60; SameSite=Lax";
    const ok = document.cookie.includes("ci-cookie-test=1");
    if (ok) {
      document.cookie = "ci-cookie-test=; path=/; max-age=0; SameSite=Lax";
    }
    cachedBlocked = !ok;
  } catch {
    cachedBlocked = true;
  }
  return cachedBlocked;
}

// Nothing to subscribe to: the answer cannot change without a page reload.
const subscribe = () => () => {};

export function CookieCheck() {
  const blocked = useSyncExternalStore(
    subscribe,
    cookiesBlocked,
    // Server render: assume fine, so the warning only ever appears after a real probe and never
    // flashes during hydration.
    () => false,
  );

  if (!blocked) return null;

  return (
    <p className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
      Cookies look blocked in this browser. Sign-in needs first-party cookies allowed for
      citreasurehunt.com, otherwise the link will appear to work and then return you to this page.
      Allow cookies for this site, or try a different browser.
    </p>
  );
}
