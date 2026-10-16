"use client";

import { useCallback, useState } from "react";
import { Turnstile } from "@marsidev/react-turnstile";
import { getInviteLinks, getVenueInviteLinks } from "@/lib/invite-links-action";
import { TELEGRAM_URL } from "@/lib/site";

type Platform = "telegram" | "whatsapp" | "signal" | "line";

const PLATFORM_LABELS: Record<Platform, string> = {
  telegram: "Telegram",
  whatsapp: "WhatsApp",
  signal: "Signal",
  line: "LINE",
};

const STORAGE_PREFIX = "cith_invite_";
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 min

type CachedLinks = { links: Partial<Record<Platform, string>>; expiresAt: number };

function readCache(entityId: string): Partial<Record<Platform, string>> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + entityId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedLinks;
    if (!parsed.expiresAt || parsed.expiresAt < Date.now()) {
      window.localStorage.removeItem(STORAGE_PREFIX + entityId);
      return null;
    }
    return parsed.links;
  } catch {
    return null;
  }
}

function writeCache(entityId: string, links: Partial<Record<Platform, string>>) {
  try {
    window.localStorage.setItem(
      STORAGE_PREFIX + entityId,
      JSON.stringify({ links, expiresAt: Date.now() + SESSION_TTL_MS } satisfies CachedLinks)
    );
  } catch {
    // private browsing / storage full — non-fatal, just won't persist across reloads
  }
}

const ERROR_MESSAGES: Record<string, string> = {
  rate_limited: "Too many requests from this network — try again tomorrow, or ask in our Telegram group.",
  challenge_failed: "Verification failed. Please try again.",
  not_found: "No invite links found.",
};

type InviteButtonsProps = {
  // A community's or a venue's invites; both go through the same gate and rate limit. The cache key
  // is the bare id either way, which is safe because ids are UUIDs.
  entity: { kind: "community" | "venue"; id: string };
  platforms: Partial<Record<Platform, boolean>>;
};

function formatPlatformList(platforms: Platform[]): string {
  const names = platforms.map((platform) => PLATFORM_LABELS[platform]);
  if (names.length <= 1) return names.join("");
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function InviteButtons({ entity, platforms }: InviteButtonsProps) {
  const entityId = entity.id;
  const availablePlatforms = (Object.keys(platforms) as Platform[]).filter(
    (platform) => platforms[platform]
  );
  const platformList = formatPlatformList(availablePlatforms);

  const [links, setLinks] = useState<Partial<Record<Platform, string>> | null>(() =>
    readCache(entityId)
  );
  const [showWidget, setShowWidget] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleStart = useCallback(() => {
    setShowWidget(true);
    setErrorMsg(null);
  }, []);

  const handleSuccess = useCallback(
    async (token: string) => {
      setVerifying(true);
      const result =
        entity.kind === "venue"
          ? await getVenueInviteLinks(entityId, token)
          : await getInviteLinks(entityId, token);
      setShowWidget(false);
      setVerifying(false);

      if ("error" in result) {
        setErrorMsg(ERROR_MESSAGES[result.error] ?? "Something went wrong. Please try again.");
        return;
      }

      setLinks(result.links);
      writeCache(entityId, result.links);
    },
    [entity.kind, entityId]
  );

  const handleWidgetError = useCallback(() => {
    setShowWidget(false);
    setVerifying(false);
    setErrorMsg("Verification failed to load. Please try again.");
  }, []);

  const siteKey = process.env.NEXT_PUBLIC_CF_TURNSTILE_SITE_KEY;

  if (links && Object.keys(links).length > 0) {
    return (
      <div className="flex flex-col gap-2">
        {(Object.entries(links) as [Platform, string][]).map(([platform, url]) => (
          <a
            key={platform}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-(--color-pine) px-4 py-3 text-sm font-semibold text-white transition hover:bg-(--color-pine)/90"
          >
            <PlatformIcon platform={platform} className="h-4 w-4" />
            Join {PLATFORM_LABELS[platform]} group
          </a>
        ))}
      </div>
    );
  }

  // No allow-listed (published) invite link for this community — direct people to the
  // main Telegram group to request access, rather than exposing an un-consented link.
  if (availablePlatforms.length === 0) {
    return (
      <a
        href={TELEGRAM_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-(--color-pine) px-4 py-3 text-sm font-semibold text-white transition hover:bg-(--color-pine)/90"
      >
        Join our Telegram group for access
      </a>
    );
  }

  // Turnstile not configured (missing env var) — fall back to the pre-I-099 stub
  if (!siteKey) {
    return (
      <a
        href={TELEGRAM_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-(--color-pine) px-4 py-3 text-sm font-semibold text-white transition hover:bg-(--color-pine)/90"
      >
        Request access via Telegram
      </a>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {!showWidget && (
        <button
          type="button"
          onClick={handleStart}
          disabled={verifying}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-(--color-pine) px-4 py-3 text-sm font-semibold text-white transition hover:bg-(--color-pine)/90 disabled:opacity-60"
        >
          {verifying
            ? "Verifying…"
            : platformList
              ? `Request access to ${platformList} ${availablePlatforms.length > 1 ? "groups" : "group"}`
              : "Request access"}
        </button>
      )}
      {showWidget && (
        <div className="flex justify-center">
          <Turnstile
            siteKey={siteKey}
            onSuccess={handleSuccess}
            onError={handleWidgetError}
            options={{ theme: "light" }}
          />
        </div>
      )}
      {errorMsg && <p className="text-center text-xs text-red-600">{errorMsg}</p>}
    </div>
  );
}

function PlatformIcon({ platform, className }: { platform: Platform; className?: string }) {
  if (platform === "telegram") return <TelegramIcon className={className} />;
  if (platform === "whatsapp") return <WhatsAppIcon className={className} />;
  if (platform === "line") return <LineIcon className={className} />;
  return <SignalIcon className={className} />;
}

function TelegramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M21.9 4.6 18.6 20c-.2 1.1-.8 1.4-1.7.9l-5.1-3.8-2.5 2.4c-.3.3-.5.5-1 .5l.4-5.2 9.5-8.6c.4-.4-.1-.6-.6-.2L5.8 13.4.7 11.8c-1.1-.3-1.1-1.1.2-1.6L20.8 2.5c.9-.3 1.7.2 1.1 2.1Z" />
    </svg>
  );
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.16-.17.2-.35.22-.64.08-.3-.15-1.26-.46-2.39-1.48-.88-.78-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.13-.14.3-.35.44-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.92-2.21-.24-.58-.49-.5-.67-.51-.17-.01-.37-.01-.57-.01s-.52.07-.79.37c-.27.3-1.04 1.01-1.04 2.48s1.06 2.87 1.21 3.07c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.62.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2.01-1.42.25-.69.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35M12.05 21.35h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 0 1-1.51-5.26C2.16 6.02 6.6 1.59 12.05 1.59c2.64 0 5.12 1.03 6.99 2.9a9.82 9.82 0 0 1 2.89 6.99c0 5.45-4.43 9.88-9.88 9.88m8.41-18.3A11.82 11.82 0 0 0 12.05 0C5.5 0 .16 5.34.16 11.89c0 2.1.55 4.15 1.59 5.95L.06 24l6.3-1.65a11.88 11.88 0 0 0 5.68 1.45h.01c6.55 0 11.89-5.34 11.89-11.89a11.82 11.82 0 0 0-3.48-8.41" />
    </svg>
  );
}

function LineIcon({ className }: { className?: string }) {
  // LINE app logo mark, from Simple Icons (CC0), fill swapped to currentColor.
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
    </svg>
  );
}

function SignalIcon({ className }: { className?: string }) {
  // Official Signal icon mark, from Signal's brand asset kit (Logo/SVG/Signal-Logo-White.svg),
  // fill swapped to currentColor to match the other platform icons.
  return (
    <svg viewBox="0 0 160 160" fill="currentColor" aria-hidden="true" className={className}>
      <path d="m80 0c4.1505 0 8.2271.31607 12.2072.925452l-1.1444 7.413248c-3.6069-.55226-7.3014-.8387-11.0628-.8387-3.7612 0-7.4555.28641-11.0623.83862l-1.1444-7.413245c3.9799-.609332 8.0564-.925375 12.2067-.925375z" />
      <path d="m98.9849 2.26619-1.7798 7.28755c7.3099 1.77896 14.1849 4.66606 20.4389 8.47306l3.895-6.411c-6.901-4.20091-14.488-7.38658-22.5541-9.34961z" />
      <path d="m127.279 15.4591-4.432 6.0507c5.977 4.3861 11.257 9.6664 15.643 15.6437l6.051-4.4324c-4.84-6.5957-10.666-12.4222-17.262-17.262z" />
      <path d="m148.384 38.4618-6.411 3.8942c3.807 6.2541 6.694 13.1299 8.473 20.4395l7.288-1.7798c-1.963-8.0657-5.149-15.6528-9.35-22.5539z" />
      <path d="m159.075 67.7934-7.414 1.1444c.553 3.6067.839 7.301.839 11.0622 0 3.7614-.286 7.4559-.839 11.0628l7.414 1.1444c.609-3.9801.925-8.0567.925-12.2072 0-4.1503-.316-8.2267-.925-12.2066z" />
      <path d="m141.973 117.645c3.807-6.255 6.694-13.13 8.473-20.44l7.288 1.7798c-1.963 8.0662-5.149 15.6532-9.35 22.5542z" />
      <path d="m138.49 122.847 6.051 4.432c-4.84 6.596-10.666 12.422-17.262 17.262l-4.433-6.051c5.978-4.386 11.258-9.666 15.644-15.643z" />
      <path d="m117.644 141.973 3.894 6.411c-6.901 4.201-14.488 7.387-22.5537 9.35l-1.7798-7.288c7.3095-1.779 14.1855-4.666 20.4395-8.473z" />
      <path d="m91.0622 151.661 1.1445 7.414c-3.9799.609-8.0564.925-12.2067.925-4.1505 0-8.2272-.316-12.2073-.925l1.1442-7.413c3.6054.552 7.2997.838 11.0631.838 3.7612 0 7.4555-.286 11.0622-.839z" />
      <path d="m62.7945 150.448-1.7794 7.286c-6.0589-1.475-11.8477-3.639-17.2785-6.406l-7.5927 1.772-1.7042-7.304 10.2604-2.394 2.4408 1.243c4.9187 2.506 10.1623 4.467 15.6536 5.803z" />
      <path d="m28.1097 147.273 1.7042 7.304-13.0145 3.036c-8.66079 2.021-16.433718-5.752-14.41286-14.412l3.03673-13.015 7.30383 1.704-3.03675 13.015c-.75782 3.248 2.15705 6.162 5.40485 5.405z" />
      <path d="m14.2041 125.56-7.30383-1.704 1.77163-7.593c-2.76664-5.431-4.93123-11.22-6.40585-17.2787l7.28586-1.7794c1.33599 5.4911 3.29709 10.7351 5.80279 15.6541l1.2435 2.441z" />
      <path d="m8.33759 91.0624-7.412228 1.1442c-.609324-3.9799-.925362-8.0563-.925362-12.2066 0-4.1505.316067-8.2271.925446-12.2072l7.413244 1.1444c-.55225 3.607-.83869 7.3014-.83869 11.0628 0 3.7631.28613 7.4572.83759 11.0624z" />
      <path d="m9.55373 62.795-7.28755-1.7798c1.96302-8.0657 5.1487-15.6528 9.34962-22.5539l6.411 3.8942c-3.807 6.2541-6.6941 13.1299-8.47307 20.4395z" />
      <path d="m21.5098 37.1531-6.0507-4.4324c4.8398-6.5957 10.6663-12.4221 17.262-17.2619l4.4324 6.0507c-5.9773 4.3861-11.2576 9.6663-15.6437 15.6436z" />
      <path d="m42.356 18.0266-3.8943-6.4111c6.9011-4.20082 14.4882-7.38645 22.554-9.34944l1.7798 7.28755c-7.3096 1.77899-14.1854 4.66589-20.4395 8.47299z" />
      <path d="m145 80c0 35.899-29.101 65-65 65-11.3866 0-22.0893-2.928-31.3965-8.072-.8961-.495-1.9417-.658-2.9389-.426l-28.9134 6.747 6.7465-28.914c.2326-.997.0692-2.043-.426-2.939-5.1439-9.307-8.0717-20.0095-8.0717-31.396 0-35.8985 29.1015-65 65-65 35.899 0 65 29.1015 65 65z" />
    </svg>
  );
}
