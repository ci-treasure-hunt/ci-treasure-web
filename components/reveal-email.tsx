"use client";

import { useCallback, useState } from "react";
import { Turnstile } from "@marsidev/react-turnstile";
import { Mail } from "lucide-react";
import { getProtectedEmail } from "@/lib/protected-email-action";

type EntityType = "venue" | "profile" | "event" | "community";

const ERROR_MESSAGES: Record<string, string> = {
  rate_limited: "Too many requests from this network — try again tomorrow.",
  challenge_failed: "Verification failed. Please try again.",
  not_found: "No email available.",
};

type RevealEmailProps = {
  entityType: EntityType;
  entityId: string;
  className?: string;
};

export function RevealEmail({ entityType, entityId, className }: RevealEmailProps) {
  const [email, setEmail] = useState<string | null>(null);
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
      const result = await getProtectedEmail(entityType, entityId, token);
      setShowWidget(false);
      setVerifying(false);

      if ("error" in result) {
        setErrorMsg(ERROR_MESSAGES[result.error] ?? "Something went wrong. Please try again.");
        return;
      }

      setEmail(result.email);
    },
    [entityType, entityId]
  );

  const handleWidgetError = useCallback(() => {
    setShowWidget(false);
    setVerifying(false);
    setErrorMsg("Verification failed to load. Please try again.");
  }, []);

  const siteKey = process.env.NEXT_PUBLIC_CF_TURNSTILE_SITE_KEY;

  const baseLinkClass =
    className ??
    "inline-flex items-center justify-between rounded-xl border border-(--color-sand-strong) bg-white px-4 py-3 text-sm font-medium text-slate-900 transition hover:border-(--color-pine) hover:text-(--color-pine)";

  if (email) {
    return (
      <a href={`mailto:${email}`} className={baseLinkClass}>
        <span className="flex items-center gap-3">
          <span className="text-(--color-pine)">
            <Mail className="h-4 w-4" />
          </span>
          <span>{email}</span>
        </span>
      </a>
    );
  }

  // Turnstile not configured (e.g. local dev without the env var) — the server
  // action would reject any token anyway, so fail closed rather than show a
  // button that always errors.
  if (!siteKey) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      {!showWidget && (
        <button type="button" onClick={handleStart} disabled={verifying} className={baseLinkClass}>
          <span className="flex items-center gap-3">
            <span className="text-(--color-pine)">
              <Mail className="h-4 w-4" />
            </span>
            <span>{verifying ? "Verifying…" : "Show email"}</span>
          </span>
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
