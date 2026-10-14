"use server";

import { createHash } from "crypto";
import { headers } from "next/headers";

import { subscribeToNewsletter, type NewsletterResult } from "@/lib/newsletter";
import { createAdminClient } from "@/lib/supabase/admin";

// I-160: the public newsletter form. Turnstile first, then a per-IP daily limit (same hashed-IP
// pattern as lib/invite-links-action.ts), then EmailOctopus, which sends the confirmation email.
const RATE_LIMIT_PER_DAY = 5;

export type NewsletterFormResult = NewsletterResult | "challenge_failed" | "rate_limited";

export async function subscribeFromForm(email: string, token: string): Promise<NewsletterFormResult> {
  const secret = process.env.CF_TURNSTILE_SECRET_KEY;
  if (!secret || !token) return "challenge_failed";
  const verifyRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ secret, response: token }),
  });
  const verified = await verifyRes.json();
  if (!verified.success) return "challenge_failed";

  const headersList = await headers();
  const rawIp = headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const today = new Date().toISOString().slice(0, 10);
  const ipHash = createHash("sha256").update(`${rawIp}:${today}`).digest("hex");

  const supabase = createAdminClient();
  const oneDayAgo = new Date(Date.now() - 86400_000).toISOString();
  const { count } = await supabase
    .from("newsletter_signup_log")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .gte("created_at", oneDayAgo);
  if ((count ?? 0) >= RATE_LIMIT_PER_DAY) return "rate_limited";

  await supabase.from("newsletter_signup_log").insert({ ip_hash: ipHash });
  return subscribeToNewsletter(email, "website");
}
