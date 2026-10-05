"use server";

import { createHash } from "crypto";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { parentIsPublic, type ContactEntityType } from "@/lib/entity-visibility";

export type PhoneContactChannel = "whatsapp" | "telegram" | "signal" | "phone";

export type RevealedPhoneContact = {
  channel: PhoneContactChannel;
  label: string | null;
  // "+<number>", for display.
  display: string;
  href: string;
};

// Shares email_reveal_log and its 20/day budget with getProtectedEmail on purpose: a scraper should
// not get 20 addresses plus 20 numbers per network per day, and a real visitor never needs that many.
const RATE_LIMIT_PER_DAY = 20;

// Built here, never stored: the table holds only digits, so the format of each deep link lives in
// one place. t.me/+<number> and signal.me/#p/+<number> are the by-number forms; username links are
// public and stay in the ordinary `links`/social columns.
function contactHref(channel: PhoneContactChannel, number: string): string {
  switch (channel) {
    case "whatsapp":
      return `https://wa.me/${number}`;
    case "telegram":
      return `https://t.me/+${number}`;
    case "signal":
      return `https://signal.me/#p/+${number}`;
    case "phone":
      return `tel:+${number}`;
  }
}

export async function getProtectedPhoneContacts(
  entityType: ContactEntityType,
  entityId: string,
  token: string,
): Promise<{ contacts: RevealedPhoneContact[] } | { error: string }> {
  if (!token || !entityId) {
    return { error: "invalid" };
  }

  const secret = process.env.CF_TURNSTILE_SECRET_KEY;
  if (!secret) {
    return { error: "not_configured" };
  }

  const verifyRes = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token }),
    }
  );
  const verified = await verifyRes.json();
  if (!verified.success) {
    return { error: "challenge_failed" };
  }

  const headersList = await headers();
  const rawIp =
    headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const today = new Date().toISOString().slice(0, 10);
  const ipHash = createHash("sha256").update(`${rawIp}:${today}`).digest("hex");

  const supabase = createAdminClient();

  const oneDayAgo = new Date(Date.now() - 86400_000).toISOString();
  const { count } = await supabase
    .from("email_reveal_log")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .gte("created_at", oneDayAgo);

  if ((count ?? 0) >= RATE_LIMIT_PER_DAY) {
    return { error: "rate_limited" };
  }

  if (!(await parentIsPublic(supabase, entityType, entityId))) {
    return { error: "not_found" };
  }

  const { data, error } = await supabase
    .from("entity_phone_contacts")
    .select("channel, number, label")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("sort_order")
    .order("created_at");

  if (error || !data?.length) {
    return { error: "not_found" };
  }

  await supabase
    .from("email_reveal_log")
    .insert({ ip_hash: ipHash, entity_type: entityType, entity_id: entityId });

  return {
    contacts: data.map((row) => {
      const channel = row.channel as PhoneContactChannel;
      const number = row.number as string;
      return {
        channel,
        label: (row.label as string | null) ?? null,
        display: `+${number}`,
        href: contactHref(channel, number),
      };
    }),
  };
}
