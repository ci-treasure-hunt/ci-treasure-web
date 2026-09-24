"use server";

// I-111: the public "Add a community" form (/communities/new). No login: anyone can submit, an
// admin reviews every submission in /admin/communities/pending before it goes live.
//
// Guards, in order: Turnstile (bots), a global cap on unreviewed submissions (floods), field
// validation, then classifyCommunityLinks() so a group invite typed into any box is stored as a
// private community_invites row, never on the row. It becomes revealable behind Turnstile when the
// admin approves the listing: the submitter confirms on the form that they may share the links
// (required checkbox, re-checked here), and approval covers them ("new data = approval", Jan
// 2026-09-23).
// Writes use the service role with an explicit column list; anon has no INSERT grant or policy on
// communities (20260923090000).
//
// No per-IP rate limit on purpose: communities has no IP column and this doesn't need one. The cap
// below bounds the damage of a flood to one screen of the review queue without storing anything
// about the submitter's network.

import { PUBLIC_ACTIVITY_LEVELS, PUBLIC_COMMUNITY_TYPES, FOCUS_OPTIONS, parseLanguages } from "@/lib/admin-communities";
import { classifyCommunityLinks, inviteFlags, type CommunityLinkInput } from "@/lib/community-links";
import { deriveCommunityLocation } from "@/lib/community-regions";
import { normalizePlaceCase } from "@/lib/place-case";
import { createPhotoTicket } from "@/lib/community-photo-ticket";
import { createUniqueSlug } from "@/lib/community-save";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyTurnstile } from "@/lib/turnstile";

const PENDING_CAP_PER_DAY = 20;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type CommunitySubmitInput = {
  name: string;
  type: string;
  worldwide: boolean;
  country: string;
  city: string;
  activityLevel: string;
  focus: string[];
  languages: string[];
  description: string;
  links: CommunityLinkInput;
  email: string;
  submitterContact: string;
  /** "I'm an organizer, or I've checked it's fine to share these links here." Required. */
  linksConsent: boolean;
  turnstileToken: string;
};

export type CommunitySubmitResult =
  // communityId + photoTicket let the form upload an optional photo to /api/communities/photo
  // right after (I-111 3a); the ticket stands in for the Turnstile token already spent here.
  | { ok: true; communityId: string; photoTicket: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

const clip = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

export async function submitCommunity(input: CommunitySubmitInput): Promise<CommunitySubmitResult> {
  if (!(await verifyTurnstile(input.turnstileToken))) {
    return { ok: false, error: "The verification check failed. Please try again." };
  }

  const supabase = createAdminClient();

  const since = new Date(Date.now() - 86400_000).toISOString();
  const { count } = await supabase
    .from("communities")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending")
    .gte("created_at", since);
  if ((count ?? 0) >= PENDING_CAP_PER_DAY) {
    return { ok: false, error: "We have a lot of submissions to review right now. Please try again tomorrow." };
  }

  // ---- Validate ---------------------------------------------------------------------------------
  const name = clip(input.name, 150);
  const type = clip(input.type, 60);
  const worldwide = Boolean(input.worldwide);
  const country = worldwide ? "" : clip(input.country, 2).toUpperCase();
  // "milan" -> "Milan": places are shown in standard capitalization (lib/place-case.ts).
  const city = normalizePlaceCase(clip(input.city, 120));
  const activityLevel = clip(input.activityLevel, 60);
  const description = clip(input.description, 4000);
  const email = clip(input.email, 200);
  const submitterContact = clip(input.submitterContact, 300);

  const fieldErrors: Record<string, string> = {};
  if (!name) fieldErrors.name = "Please give the community's name.";
  if (!(PUBLIC_COMMUNITY_TYPES as readonly string[]).includes(type)) fieldErrors.type = "Please pick a type.";
  if (!worldwide && !/^[A-Z]{2}$/.test(country)) fieldErrors.country = "Please pick a country, or choose worldwide.";
  if (!city) fieldErrors.city = worldwide ? "Please say where, e.g. Worldwide or Latin America." : "Please give the city.";
  if (activityLevel && !(PUBLIC_ACTIVITY_LEVELS as readonly string[]).includes(activityLevel)) {
    fieldErrors.activityLevel = "Please pick one of the options.";
  }
  if (email && !EMAIL_RE.test(email)) fieldErrors.email = "This doesn't look like an email address.";
  if (!input.linksConsent) fieldErrors.linksConsent = "Please confirm that these links may be shared here.";

  const links = classifyCommunityLinks(input.links ?? {});
  for (const [field, message] of Object.entries(links.errors)) fieldErrors[`links.${field}`] = message;
  if (links.linkCount === 0 && Object.keys(links.errors).length === 0) {
    fieldErrors.links = "Please add at least one link, a group or chat link is enough.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, error: "Please check the highlighted fields.", fieldErrors };
  }

  // ---- Write ------------------------------------------------------------------------------------
  // Region/continent now (cheap, no network); coordinates on approval, so an anonymous form can't
  // spend the geocoding quota.
  const { region, continent } = deriveCommunityLocation(worldwide ? null : country);
  const slug = await createUniqueSlug(name, city);

  const { data: row, error } = await supabase
    .from("communities")
    .insert({
      name,
      slug,
      type,
      status: "pending",
      city,
      country: worldwide ? null : country,
      region,
      continent,
      activity_level: activityLevel || null,
      focus: (input.focus ?? []).filter((f) => (FOCUS_OPTIONS as readonly string[]).includes(f)),
      languages: parseLanguages((input.languages ?? []).join(",")),
      description: description || null,
      ...links.columns,
      ...inviteFlags(Object.keys(links.invites)),
      submitter_contact: submitterContact || null,
      // Checked above; approveCommunity() publishes the invites only when this is set.
      links_consent: true,
    })
    .select("id, slug")
    .single();
  if (error || !row) {
    return { ok: false, error: "Something went wrong saving your submission. Please try again." };
  }

  const inviteRows = Object.entries(links.invites).map(([platform, url]) => ({
    community_id: row.id,
    platform,
    url,
    // Not revealable while pending; approveCommunity() flips it with the listing. The submitter
    // confirmed on the form that they may share the link ("new data = approval", 2026-09-23).
    published: false,
  }));
  if (inviteRows.length > 0) await supabase.from("community_invites").insert(inviteRows);
  // source defaults to 'manual'; the address is only ever revealed behind Turnstile.
  if (email) await supabase.from("entity_emails").insert({ entity_type: "community", entity_id: row.id, email });

  await notifyTelegram({ name, city, country: worldwide ? "worldwide" : country, type });

  return { ok: true, communityId: row.id, photoTicket: createPhotoTicket(row.id) };
}

async function notifyTelegram(info: { name: string; city: string; country: string; type: string }) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  const threadId = process.env.TELEGRAM_REPORT_THREAD_ID;
  if (!token || !chatId) return;

  // Name/place/type only. The submitter's contact and the community's email stay in the admin
  // view, not in Telegram (same convention as the other admin notifiers, I-159).
  const text = [
    `🌱 New community submitted · ${info.type}`,
    `${info.name} · ${info.city}, ${info.country}`,
    "→ https://citreasurehunt.com/admin/communities/pending",
  ].join("\n");

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        message_thread_id: threadId ? Number(threadId) : undefined,
        text,
        link_preview_options: { is_disabled: true },
      }),
    });
  } catch {
    // A failed ping must not fail the submission; the queue badge still shows it.
  }
}
