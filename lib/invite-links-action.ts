"use server";

import { createHash } from "crypto";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

const RATE_LIMIT_PER_DAY = 20;

type InvitePlatform = "telegram" | "whatsapp" | "signal" | "line";
type InviteLinks = Partial<Record<InvitePlatform, string>>;
type InviteResult = { links: InviteLinks } | { error: string };

// Both reveals share one rate limit: the log counts rows per ip_hash whichever kind they are.
type RevealTarget =
  | { kind: "community"; id: string }
  | { kind: "venue"; id: string }
  | { kind: "profile"; id: string };

export async function getInviteLinks(communityId: string, token: string): Promise<InviteResult> {
  return revealInviteLinks({ kind: "community", id: communityId }, token);
}

export async function getVenueInviteLinks(venueId: string, token: string): Promise<InviteResult> {
  return revealInviteLinks({ kind: "venue", id: venueId }, token);
}

export async function getProfileInviteLinks(profileId: string, token: string): Promise<InviteResult> {
  return revealInviteLinks({ kind: "profile", id: profileId }, token);
}

async function revealInviteLinks(target: RevealTarget, token: string): Promise<InviteResult> {
  if (!target.id || !token) {
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
    .from("invite_reveal_log")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .gte("created_at", oneDayAgo);

  if ((count ?? 0) >= RATE_LIMIT_PER_DAY) {
    return { error: "rate_limited" };
  }

  // The parent must be live before revealing its invites: an active (not soft-deleted) community,
  // or a venue or profile with a public page.
  const parent =
    target.kind === "community"
      ? await supabase
          .from("communities")
          .select("id")
          .eq("id", target.id)
          .is("deleted_at", null)
          .maybeSingle()
      : await supabase
          .from(target.kind === "venue" ? "venues" : "profiles")
          .select("id")
          .eq("id", target.id)
          .eq("visibility", "public")
          .maybeSingle();

  if (!parent.data) {
    return { error: "not_found" };
  }

  const { data, error } =
    target.kind === "community"
      ? await supabase
          .from("community_invites")
          .select("platform, url")
          .eq("community_id", target.id)
          .eq("published", true)
          .is("broken_since", null)
      : target.kind === "venue"
        ? await supabase
            .from("venue_invites")
            .select("platform, url")
            .eq("venue_id", target.id)
            .eq("published", true)
        : await supabase
            .from("profile_invites")
            .select("platform, url")
            .eq("profile_id", target.id)
            .eq("published", true);

  if (error) {
    return { error: "lookup_failed" };
  }

  if (!data || data.length === 0) {
    return { error: "not_found" };
  }

  await supabase
    .from("invite_reveal_log")
    .insert(
      target.kind === "community"
        ? { ip_hash: ipHash, community_id: target.id }
        : target.kind === "venue"
          ? { ip_hash: ipHash, venue_id: target.id }
          : { ip_hash: ipHash, profile_id: target.id }
    );

  const rows = data as { platform: string; url: string }[];
  const links: InviteLinks = {};
  for (const row of rows) {
    if (row.platform === "telegram" || row.platform === "whatsapp" || row.platform === "signal" || row.platform === "line") {
      links[row.platform] = row.url;
    }
  }

  return { links };
}
