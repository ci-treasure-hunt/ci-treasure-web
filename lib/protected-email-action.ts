"use server";

import { createHash } from "crypto";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import type { EmailEntityType } from "@/lib/entity-email";

type EntityType = EmailEntityType;

// Same ip_hash rate-limit pattern as its siblings (invite-links-action.ts / I-099,
// report-action.ts / I-012) — defense-in-depth alongside Turnstile, not a replacement.
const RATE_LIMIT_PER_DAY = 20;

// The parent must be publicly visible before its address is released.
//
// I-165 F3: this used to be a bare `.eq("id", entityId)` against the entity's own table with no
// status/visibility check, on the service-role client which bypasses RLS. Anyone holding the UUID
// of a pending event or a shadow profile could pull its address, Turnstile and rate limit
// notwithstanding. Those UUIDs are not enumerable under RLS so it was never wide open, but the
// check is one query and the conditions below deliberately mirror exactly what the public detail
// pages already require (getVenueBySlug and getTeacherBySlug both filter visibility = 'public';
// the events condition is the events RLS policy itself), so nothing reachable loses its button.
async function parentIsPublic(
  admin: ReturnType<typeof createAdminClient>,
  entityType: EntityType,
  entityId: string,
): Promise<boolean> {
  switch (entityType) {
    case "event": {
      const { data } = await admin
        .from("events")
        .select("id")
        .eq("id", entityId)
        .eq("hide", false)
        .in("status", ["published", "archived"])
        .maybeSingle();
      return Boolean(data);
    }
    case "profile": {
      const { data } = await admin
        .from("profiles")
        .select("id")
        .eq("id", entityId)
        .eq("visibility", "public")
        .maybeSingle();
      return Boolean(data);
    }
    case "venue": {
      const { data } = await admin
        .from("venues")
        .select("id")
        .eq("id", entityId)
        .eq("visibility", "public")
        .maybeSingle();
      return Boolean(data);
    }
    case "community": {
      const { data } = await admin
        .from("communities")
        .select("id")
        .eq("id", entityId)
        .is("deleted_at", null)
        .maybeSingle();
      return Boolean(data);
    }
  }
}

export async function getProtectedEmail(
  entityType: EntityType,
  entityId: string,
  token: string
): Promise<{ email: string } | { error: string }> {
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

  // I-165 F3: addresses live in entity_emails, which denies anon and authenticated entirely, rather
  // than in a column on the public table. Before that, the Turnstile gate here was decorative:
  // GET /rest/v1/events?select=contact_email with the public anon key returned the lot.
  const { data, error } = await supabase
    .from("entity_emails")
    .select("email")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .maybeSingle();

  if (error || !data?.email) {
    return { error: "not_found" };
  }

  await supabase
    .from("email_reveal_log")
    .insert({ ip_hash: ipHash, entity_type: entityType, entity_id: entityId });

  return { email: data.email as string };
}
