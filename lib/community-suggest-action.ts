"use server";

// I-111 Stage 2: "Suggest an edit" on /communities/[slug], replacing the Airtable "Report an Issue
// or Suggest an Edit" form. Nothing is applied automatically: suggestions land in
// community_edit_suggestions (service role only, 20260924090000) and the admin applies them by hand
// in the editor from /admin/communities/edits. Group invite links pasted into the text are fine for
// that reason: the table is admin-only, and the editor runs them through lib/community-links.ts.
//
// Guards, in order: Turnstile, then the same daily ip_hash limit as report-action.ts. The hash is
// salted with the date, so it can't be joined across days.

import { createHash } from "crypto";
import { headers } from "next/headers";

import { SUGGESTION_FIELDS, SUGGESTION_TYPES, TYPES_WITH_FIELDS, suggestionTypeLabel } from "@/lib/community-suggest-options";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyTurnstile } from "@/lib/turnstile";

const RATE_LIMIT_PER_DAY = 5;

export type CommunitySuggestInput = {
  communityId: string;
  requestType: string;
  fields: string[];
  newValue: string;
  contact: string;
  turnstileToken: string;
};

export type CommunitySuggestResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

const clip = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

export async function suggestCommunityEdit(input: CommunitySuggestInput): Promise<CommunitySuggestResult> {
  if (!(await verifyTurnstile(input.turnstileToken))) {
    return { ok: false, error: "The verification check failed. Please try again." };
  }

  const requestType = clip(input.requestType, 40);
  const newValue = clip(input.newValue, 4000);
  const contact = clip(input.contact, 300);
  const wantsFields = TYPES_WITH_FIELDS.includes(requestType);
  const fields = wantsFields
    ? (input.fields ?? []).filter((f) => (SUGGESTION_FIELDS as readonly string[]).includes(f))
    : [];

  const fieldErrors: Record<string, string> = {};
  if (!SUGGESTION_TYPES.some((t) => t.value === requestType)) fieldErrors.requestType = "Please pick what kind of change.";
  if (wantsFields && fields.length === 0) fieldErrors.fields = "Please tick at least one field.";
  if (!newValue) fieldErrors.newValue = "Please tell us what should change.";
  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, error: "Please check the highlighted fields.", fieldErrors };
  }

  const headersList = await headers();
  const rawIp = headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const today = new Date().toISOString().slice(0, 10);
  const ipHash = createHash("sha256").update(`${rawIp}:${today}`).digest("hex");

  const supabase = createAdminClient();

  const oneDayAgo = new Date(Date.now() - 86400_000).toISOString();
  const { count } = await supabase
    .from("community_edit_suggestions")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .gte("created_at", oneDayAgo);
  if ((count ?? 0) >= RATE_LIMIT_PER_DAY) {
    return { ok: false, error: "Too many suggestions from this connection today. Please try again tomorrow." };
  }

  const { data: community } = await supabase
    .from("communities")
    .select("id, name, slug")
    .eq("id", input.communityId)
    .eq("status", "published")
    .is("deleted_at", null)
    .maybeSingle();
  if (!community) {
    return { ok: false, error: "This community can't be found any more." };
  }

  const { error } = await supabase.from("community_edit_suggestions").insert({
    community_id: community.id,
    request_type: requestType,
    fields,
    new_value: newValue,
    contact: contact || null,
    ip_hash: ipHash,
  });
  if (error) {
    return { ok: false, error: "Something went wrong saving your suggestion. Please try again." };
  }

  await notifyTelegram({ name: community.name, slug: community.slug, requestType, fields });

  return { ok: true };
}

async function notifyTelegram(info: { name: string; slug: string; requestType: string; fields: string[] }) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  const threadId = process.env.TELEGRAM_REPORT_THREAD_ID;
  if (!token || !chatId) return;

  // Community and change type only. The suggested text can hold private group links and the
  // submitter's contact, so both stay in the admin view (I-159).
  const text = [
    `✏️ Edit suggestion · ${suggestionTypeLabel(info.requestType)}${info.fields.length ? ` (${info.fields.join(", ")})` : ""}`,
    `${info.name} → https://citreasurehunt.com/communities/${info.slug}`,
    "→ https://citreasurehunt.com/admin/communities/edits",
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
    // A failed ping must not fail the suggestion; the queue badge still shows it.
  }
}
