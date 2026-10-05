"use client";

import { useCallback, useState } from "react";
import { Turnstile } from "@marsidev/react-turnstile";
import { MessageCircle, Phone } from "lucide-react";
import {
  getProtectedPhoneContacts,
  type PhoneContactChannel,
  type RevealedPhoneContact,
} from "@/lib/protected-phone-contact-action";
import type { ContactEntityType } from "@/lib/entity-visibility";

const ERROR_MESSAGES: Record<string, string> = {
  rate_limited: "Too many requests from this network — try again tomorrow.",
  challenge_failed: "Verification failed. Please try again.",
  not_found: "No contact available.",
};

const CHANNEL_NAMES: Record<PhoneContactChannel, string> = {
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  signal: "Signal",
  phone: "Phone",
};

type RevealPhoneContactsProps = {
  entityType: ContactEntityType;
  entityId: string;
  className?: string;
};

// Sibling of RevealEmail for entity_phone_contacts: same Turnstile flow, but one reveal can return
// several contacts (e.g. two organizers' WhatsApp numbers), each rendered as its own link.
export function RevealPhoneContacts({ entityType, entityId, className }: RevealPhoneContactsProps) {
  const [contacts, setContacts] = useState<RevealedPhoneContact[] | null>(null);
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
      const result = await getProtectedPhoneContacts(entityType, entityId, token);
      setShowWidget(false);
      setVerifying(false);

      if ("error" in result) {
        setErrorMsg(ERROR_MESSAGES[result.error] ?? "Something went wrong. Please try again.");
        return;
      }

      setContacts(result.contacts);
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

  if (contacts) {
    return (
      <>
        {contacts.map((c) => (
          <a
            key={`${c.channel}-${c.display}`}
            href={c.href}
            target={c.channel === "phone" ? undefined : "_blank"}
            rel="noopener noreferrer"
            className={baseLinkClass}
          >
            <span className="flex items-center gap-3">
              <span className="text-(--color-pine)">
                {c.channel === "phone" ? <Phone className="h-4 w-4" /> : <MessageCircle className="h-4 w-4" />}
              </span>
              <span>
                {CHANNEL_NAMES[c.channel]}
                {c.label ? ` · ${c.label}` : ""}
                <span className="ml-2 text-slate-500">{c.display}</span>
              </span>
            </span>
          </a>
        ))}
      </>
    );
  }

  // Turnstile not configured (e.g. local dev without the env var): fail closed, as RevealEmail does.
  if (!siteKey) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      {!showWidget && (
        <button type="button" onClick={handleStart} disabled={verifying} className={baseLinkClass}>
          <span className="flex items-center gap-3">
            <span className="text-(--color-pine)">
              <MessageCircle className="h-4 w-4" />
            </span>
            <span>{verifying ? "Verifying…" : "Show phone / WhatsApp"}</span>
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
