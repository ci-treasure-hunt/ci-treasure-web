import { promises as dns } from "dns";
import { isIP } from "net";
import sharp from "sharp";
import { createAdminClient, toStorageBody } from "@/lib/supabase/admin";
import { getMediumUrl, getSmallUrl } from "@/lib/image-url";

// Same conventions as app/dashboard/profile/edit/photo-actions.ts (I-122): resize long edge,
// EXIF-safe rotate, JPEG quality 82. I-129 Phase 2: `large` always stays JPEG (the only
// size feeding og:image/JSON-LD, and Telegram's link-preview unfurler doesn't reliably
// render WebP); `medium`/`small` are pure in-page uses, safe to convert to WebP.
const MAX_FETCH_BYTES = 8 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 5;
const LARGE_LONG_EDGE = 1600;
const LARGE_QUALITY = 82;
const MEDIUM_LONG_EDGE = 400;
const MEDIUM_QUALITY = 75;
const SMALL_LONG_EDGE = 120;
const SMALL_QUALITY = 70;

// Real magic-byte check, independent of whatever Content-Type the source claims.
function hasValidImageSignature(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true; // JPEG
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true; // PNG
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return true; // WebP
  if (buf.subarray(0, 3).toString("ascii") === "GIF") return true; // GIF
  return false;
}

function isOwnBucketUrl(url: string): boolean {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return Boolean(base) && url.startsWith(`${base}/storage/`);
}

// SSRF guard (2026-07-22): this function fetches a URL an organizer or admin pastes into a
// form, server-side, with no allowlist — before this, an attacker-controlled URL like
// http://169.254.169.254/latest/meta-data/ or http://localhost:<internal-port>/... would be
// fetched by our server exactly like any other image link. Blocks loopback/private/
// link-local ranges by IP, checked both on a literal IP in the URL (brackets stripped, so
// http://[::1]/ can't slip past isIP) and on every address the hostname's DNS lookup returns
// (a hostname can have mixed public/private A/AAAA records). IPv4-mapped IPv6
// (::ffff:169.254.169.254, incl. hex and expanded forms) and NAT64 (64:ff9b::/96) are
// unwrapped and checked as IPv4 — the first version of this guard treated them as public IPv6.
// Not a complete fix for DNS-rebinding (the IP is re-resolved by fetch() itself, not pinned
// to the address checked here) — acceptable for this app's threat model, but worth knowing
// if this ever needs to be airtight.
export function isPrivateIp(ip: string): boolean {
  const cleanIp = ip.replace(/^\[|\]$/g, "").trim().toLowerCase();
  const version = isIP(cleanIp);
  if (version === 4) {
    const parts = cleanIp.split(".").map(Number);
    if (parts.length !== 4 || parts.some((n) => isNaN(n) || n < 0 || n > 255)) return true;
    const [a, b, c] = parts;
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 10) return true; // 10.0.0.0/8 private
    if (a === 127) return true; // 127.0.0.0/8 loopback
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local / cloud metadata (169.254.169.254)
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
    if (a === 192 && b === 168) return true; // 192.168.0.0/16 private
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT / cloud internal
    if (a === 192 && b === 0 && c === 0) return true; // 192.0.0.0/24 IETF Protocol Assignments
    if (a === 192 && b === 0 && c === 2) return true; // 192.0.2.0/24 TEST-NET-1
    if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 benchmarking
    if (a === 198 && b === 51 && c === 100) return true; // 198.51.100.0/24 TEST-NET-2
    if (a === 203 && b === 0 && c === 113) return true; // 203.0.113.0/24 TEST-NET-3
    if (a >= 224) return true; // 224.0.0.0/4 multicast & reserved
    return false;
  }
  if (version === 6) {
    if (cleanIp === "::" || cleanIp === "::1" || cleanIp === "0:0:0:0:0:0:0:0" || cleanIp === "0:0:0:0:0:0:0:1") return true; // unspecified and loopback

    // Unwrap an embedded IPv4 tail — dotted ("169.254.169.254") or hex ("a9fe:a9fe") — and
    // check it as IPv4. Used by both the v4-mapped and the NAT64 branches below.
    const embeddedV4 = (rawTail: string): boolean => {
      // A compressed "::" boundary leaves a stray leading colon on the tail ("64:ff9b::1.2.3.4").
      const tail = rawTail.replace(/^:+/, "");
      if (isIP(tail) === 4) {
        return isPrivateIp(tail);
      }
      const hexParts = tail.split(":");
      if (hexParts.length === 2) {
        const p1 = parseInt(hexParts[0], 16);
        const p2 = parseInt(hexParts[1], 16);
        if (!isNaN(p1) && !isNaN(p2) && p1 <= 0xffff && p2 <= 0xffff) {
          const a = (p1 >> 8) & 0xff;
          const b = p1 & 0xff;
          const c = (p2 >> 8) & 0xff;
          const d = p2 & 0xff;
          return isPrivateIp(`${a}.${b}.${c}.${d}`);
        }
      }
      return true; // unrecognized tail — fail closed
    };

    // IPv4-mapped IPv6 (::ffff:x.x.x.x or 0:0:0:0:0:ffff:x.x.x.x or hex form)
    if (cleanIp.startsWith("::ffff:") || cleanIp.startsWith("0:0:0:0:0:ffff:")) {
      return embeddedV4(cleanIp.replace(/^(::ffff:|0:0:0:0:0:ffff:)/i, ""));
    }

    // IPv4-compatible IPv6 (::x.x.x.x)
    if (cleanIp.startsWith("::") && cleanIp.includes(".")) {
      const v4Part = cleanIp.slice(2);
      if (isIP(v4Part) === 4) {
        return isPrivateIp(v4Part);
      }
    }

    // fe80::/10 link-local (fe8, fe9, fea, feb)
    if (/^fe[89ab]/i.test(cleanIp)) return true;
    // fc00::/7 unique local (fc, fd)
    if (cleanIp.startsWith("fc") || cleanIp.startsWith("fd")) return true;
    // 64:ff9b::/96 (IPv4/IPv6 translation, incl. the hex form a DNS64 resolver returns)
    if (cleanIp.startsWith("64:ff9b:")) {
      return embeddedV4(cleanIp.slice("64:ff9b:".length));
    }
    // 2001:db8::/32 documentation
    if (cleanIp.startsWith("2001:db8:") || cleanIp === "2001:db8") return true;
    // 2001:10::/28 & 2001:20::/28 (ORCHID)
    if (cleanIp.startsWith("2001:1") || cleanIp.startsWith("2001:2")) return true;
    // 100::/64 discard prefix
    if (cleanIp.startsWith("100:")) return true;
    // ff00::/8 multicast
    if (cleanIp.startsWith("ff")) return true;

    return false;
  }
  return false;
}

export async function assertPublicUrl(rawUrl: string): Promise<{ error: string } | null> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { error: "Invalid URL" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { error: "Only http/https URLs are allowed" };
  }
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
  if (hostname === "localhost" || isPrivateIp(hostname)) {
    return { error: "URL not allowed" };
  }
  try {
    // Check EVERY resolved address, not just the first: a hostname with mixed public/private
    // A/AAAA records must not slip a private address past the guard.
    const results = await dns.lookup(hostname, { all: true });
    if (results.some((result) => isPrivateIp(result.address))) {
      return { error: "URL not allowed" };
    }
  } catch {
    return { error: "Could not resolve URL" };
  }
  return null;
}

// I-165 Finding 5: assertPublicUrl above only ever saw the URL as pasted. fetch() then followed
// redirects on its own, so a public host answering 302 -> http://169.254.169.254/... was fetched
// anyway. Exfiltration was already blocked downstream (the content-type check, the magic-byte
// check and the sharp re-encode all reject non-image responses), so what this closes is blind
// internal probing, not a data leak. The DNS-rebinding caveat documented above still stands and is
// still accepted.
//
// Returns a result object rather than throwing, so the specific reason ("URL not allowed") still
// reaches the caller. Throwing would land in the caller's catch and be flattened into the generic
// "Could not fetch image URL", losing the diagnostic that actually tells an admin what happened.
async function fetchFollowingSafeRedirects(
  startUrl: string,
): Promise<{ response: Response } | { error: string }> {
  // ONE deadline for the whole chain, created outside the loop. Creating the signal per hop would
  // give a malicious chain MAX_REDIRECTS + 1 full timeouts (60s) and hold a serverless function
  // open for the duration — worse than the single-fetch behaviour this replaces, since fetch's own
  // redirect following was always bounded by one signal.
  const deadline = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  let current = startUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const blocked = await assertPublicUrl(current);
    if (blocked) {
      return blocked;
    }

    let res: Response;
    try {
      // A bare Node fetch with no User-Agent/Accept reads as an obvious bot to most anti-scraping
      // CDNs — found live 2026-07-22: Eventbrite's CDN returned a Content-Type: image/jpeg
      // response with corrupted bytes (not a clean 4xx/HTML block page) specifically to a
      // server-side fetch, while the identical URL fetched normally was fine. A real browser
      // UA/Accept header is the standard, low-risk mitigation for this — it's a publicly
      // embeddable image, not a real access-control bypass.
      res = await fetch(current, {
        redirect: "manual",
        signal: deadline,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        },
      });
    } catch {
      return { error: "Could not fetch image URL" };
    }

    if (res.status < 300 || res.status > 399) {
      return { response: res };
    }

    const location = res.headers.get("location");
    // Drain the redirect's body before moving on. With redirect: "manual" nothing consumes these,
    // and an unread body keeps its connection checked out of undici's pool.
    await res.body?.cancel().catch(() => {});

    if (!location) {
      return { error: "Image URL returned a redirect with no target" };
    }
    try {
      current = new URL(location, current).toString();
    } catch {
      return { error: "Image URL redirected to an invalid target" };
    }
  }

  return { error: "Too many redirects" };
}

/**
 * Fetches an external image URL, validates/normalizes it, and stores our own copy —
 * closes the "organizer-pasted external URL rots/expires" risk (I-126). Skips entirely if
 * the URL already points into one of our own buckets.
 */
export async function rehostExternalImage(
  url: string,
  bucket: string,
  path: string,
): Promise<{ url: string } | { error: string }> {
  if (!url) {
    return { error: "No URL provided" };
  }
  if (isOwnBucketUrl(url)) {
    return { url };
  }

  // I-165: the standalone assertPublicUrl() call that used to sit here is now hop 0 of the loop
  // inside fetchFollowingSafeRedirects, so every hop is validated rather than just the first.
  const fetched = await fetchFollowingSafeRedirects(url);
  if ("error" in fetched) {
    return fetched;
  }
  const response = fetched.response;
  if (!response.ok || !response.body) {
    return { error: `Image URL returned ${response.status}` };
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) {
    return { error: "URL did not return an image" };
  }

  // Stream with a byte cap - don't trust Content-Length alone, a server can lie.
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_FETCH_BYTES) {
      await reader.cancel();
      return { error: "Image too large (max 8MB)" };
    }
    chunks.push(value);
  }
  const inputBuffer = Buffer.concat(chunks.map((c) => Buffer.from(c)));

  // Don't trust the Content-Type header alone — found live 2026-07-22: a source CDN
  // returned Content-Type: image/jpeg with corrupted bytes instead of a clean error,
  // which sharp then "successfully" processed into a corrupted-but-plausible-looking
  // output file (silently broken on the live site instead of a clear failure at
  // submission time). Check the real magic bytes before handing anything to sharp.
  if (!hasValidImageSignature(inputBuffer)) {
    return { error: "URL did not return valid image data (the source may be blocking automated requests)" };
  }

  let largeBuffer: Buffer;
  let mediumBuffer: Buffer;
  let smallBuffer: Buffer;
  try {
    const rotated = sharp(inputBuffer).rotate();
    largeBuffer = await rotated
      .clone()
      .resize(LARGE_LONG_EDGE, LARGE_LONG_EDGE, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: LARGE_QUALITY })
      .toBuffer();
    mediumBuffer = await rotated
      .clone()
      .resize(MEDIUM_LONG_EDGE, MEDIUM_LONG_EDGE, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: MEDIUM_QUALITY })
      .toBuffer();
    smallBuffer = await rotated
      .clone()
      .resize(SMALL_LONG_EDGE, SMALL_LONG_EDGE, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: SMALL_QUALITY })
      .toBuffer();
  } catch {
    return { error: "Could not process image" };
  }

  const admin = createAdminClient();
  const mediumPath = getMediumUrl(path);
  const smallPath = getSmallUrl(path);

  // Found live 2026-07-22, confirmed 2026-08-10: storage-js's upload() corrupts binary
  // content when given a raw Buffer on this stack (independent of which fetch
  // implementation it uses — see toStorageBody in lib/supabase/admin.ts). Wrapping in a
  // Blob forces storage-js down its FormData branch instead, a binary-safe path — verified
  // via a direct reproduction (SHA-256 byte comparison) during the 2026-08-10 investigation,
  // not just theorized.
  const { error: uploadError } = await admin.storage
    .from(bucket)
    // 30 days, not longer: upsert overwrites in place on re-save, so this caps
    // how stale a browser's cached copy can get after an organizer swaps their
    // event image. Supabase's default was 1h — PageSpeed Insights flagged
    // ~14.7MB in avoidable re-fetches across the homepage at that TTL.
    .upload(path, toStorageBody(largeBuffer, "image/jpeg"), { upsert: true, cacheControl: "2592000" });
  if (uploadError) {
    return { error: uploadError.message };
  }

  // Atomic-ish: large uploads first, then medium/small. If either smaller
  // upload fails, roll back everything uploaded so far so storage never ends
  // up with a large file and missing medium/small siblings (I-129 — see spec
  // for why this isn't a DB column).
  const { error: mediumError } = await admin.storage
    .from(bucket)
    .upload(mediumPath, toStorageBody(mediumBuffer, "image/webp"), { upsert: true, cacheControl: "2592000" });
  if (mediumError) {
    await admin.storage.from(bucket).remove([path]);
    return { error: mediumError.message };
  }

  const { error: smallError } = await admin.storage
    .from(bucket)
    .upload(smallPath, toStorageBody(smallBuffer, "image/webp"), { upsert: true, cacheControl: "2592000" });
  if (smallError) {
    await admin.storage.from(bucket).remove([path, mediumPath]);
    return { error: smallError.message };
  }

  const { data: { publicUrl } } = admin.storage.from(bucket).getPublicUrl(path);
  return { url: publicUrl };
}

/**
 * Shared entry point for every "organizer/admin pastes an image URL into an event form"
 * path (I-126, and the admin-form gap found 2026-07-22 where the PUT/POST routes were
 * saving the pasted URL raw instead of calling rehostExternalImage at all). Non-fatal on
 * failure: caller should save the event without an image and surface the warning, not
 * block the save.
 */
export async function resolveExternalEventImage(
  rawUrl: string,
  bucket = "event-images",
): Promise<{ imageUrl: string | null; warning?: string }> {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { imageUrl: null };
  }
  const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
  const result = await rehostExternalImage(trimmed, bucket, path);
  if ("error" in result) {
    console.error("Event image rehost failed:", result.error);
    return {
      imageUrl: null,
      warning: "We couldn't process that image link — the event was saved without an image.",
    };
  }
  return { imageUrl: result.url };
}
