/**
 * I-165 Finding 2. The only scheme allowlist in the app — if you are adding a path that renders a
 * user- or organizer-supplied URL into an href, it goes through here.
 *
 * Before this existed, event links had no scheme check at any layer (parseLinkItems ->
 * normalizeLinkItems -> event-detail-view's `href={item.url}`), so a stored `javascript:...` link
 * executed in our own origin when clicked — including by an admin reviewing a pending submission.
 * Venue and teacher pages looked protected but were only lucky: their local `ensureHttps` prefixed
 * anything without a leading "http", which neutralised `javascript:` as a side effect of
 * formatting rather than as a check, in three separate copies.
 */

/**
 * Returns a safe absolute URL, or null if the input cannot be made safe.
 *
 * Deliberately http/https ONLY. `mailto:` is not allowed: `links` renders as a plain public <a>,
 * while an address belongs in the Turnstile-gated contact_email instead. Allowing mailto here would
 * reopen exactly the hole extractBareEmailFromLinks was written to close on 2026-08-18 (see the
 * comment above BARE_EMAIL in lib/organizer-events.ts). No link type in LINK_CANONICAL_ORDER needs
 * it.
 *
 * Behaviour:
 *
 *   "ci-cph.dk/events"      -> https://ci-cph.dk/events        (bare host, the common input)
 *   "ci-cph.dk:8080/x"      -> https://ci-cph.dk:8080/x        (bare host + port, still fine)
 *   "//evil.com"            -> https://evil.com/               (protocol-relative, made explicit)
 *   "javascript:alert(1)"   -> null
 *   "mailto:a@b.com"        -> null
 *   "data:text/html,<x>"    -> null
 *   "file:///etc/passwd"    -> null
 *
 * Two earlier drafts got this wrong in opposite directions, so both traps are worth naming:
 *
 * 1. Treating any leading /^[a-z][a-z0-9+.-]*:/ as "a scheme" also matches the HOST in
 *    "ci-cph.dk:8080", because "." and "-" are legal scheme characters. That rejected a valid
 *    URL, and on the read path it would have silently deleted a link from a live page.
 * 2. Dropping the scheme check entirely and relying on "prefix with https:// and let the URL
 *    parser reject the nonsense" does NOT work, though it looks like it should. "mailto:a@b.com"
 *    becomes "https://mailto:a@b.com", which is a perfectly valid URL: "mailto:a" parses as
 *    userinfo and "b.com" as the host. It was accepted, address and all. Likewise
 *    "file:///etc/passwd" became "https://file///etc/passwd". Caught by the test cases below the
 *    fold rather than by review, which is the argument for keeping them.
 *
 * So: an explicit scheme check, with an explicit carve-out for host:port.
 */
export function safeExternalUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Anything with a scheme that isn't http/https is rejected outright. The `isHostPort` carve-out
  // is what keeps "ci-cph.dk:8080/x" working: there, the text before the colon is a host, not a
  // scheme, and the text after it is a port number.
  const schemeLike = /^([a-z][a-z0-9+.\-]*):([\s\S]*)$/i.exec(trimmed);
  if (schemeLike) {
    const [, scheme, rest] = schemeLike;
    const isHostPort = /^\d+(?:[/?#]|$)/.test(rest);
    if (!isHostPort && !/^https?$/i.test(scheme)) return null;
  }

  const alreadyAbsolute = /^https?:\/\//i.test(trimmed);
  const candidate = alreadyAbsolute
    ? trimmed
    // Strip leading slashes/backslashes so "//host" and "/\host" become explicit https, never
    // something a browser could read as same-origin.
    : `https://${trimmed.replace(/^[/\\]+/, "")}`;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }

  // Belt and braces. Nothing above can currently produce another scheme, but this is the line that
  // must hold if the construction above is ever changed.
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  // Return the input unchanged when it was already a well-formed absolute URL, so that merely
  // re-saving an event doesn't rewrite an organizer's links (URL.toString() normalises: it appends
  // a trailing slash to bare origins and percent-encodes). Only the repaired forms get rewritten.
  return alreadyAbsolute ? trimmed : url.toString();
}
