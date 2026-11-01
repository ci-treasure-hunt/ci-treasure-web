// I-160: newsletter signups through the EmailOctopus v2 API instead of their embedded form.
// Server-only, deliberately no "use server" (same reasoning as lib/notify.ts): this takes any
// address, so it must only ever be called from actions that have done their own checks
// (Turnstile + rate limit on /newsletter, a verified session on the dashboard).
//
// Double opt-in stays with EmailOctopus: the list has it enabled, and we never send `status`, so a
// new contact lands as "pending" and EmailOctopus sends its own confirmation email and keeps the
// consent record. Verified against the live list 2026-10-15 (contact came back pending, the
// confirmation email arrived 16s later). Never send status "subscribed" from here: that would
// silently turn the list into single opt-in.
//
// A contact stuck at "pending" (confirmation email lost or deleted with the spam folder) used to be
// locked out: signing up again only got "already exists", and EmailOctopus has no resend. Now a
// repeat signup deletes the pending contact and creates it again, which makes EmailOctopus send a
// fresh confirmation (verified 2026-11-01: second email arrived 5s after the re-create). It only
// ever happens because the person asked again, and never touches subscribed or unsubscribed contacts.

import { createHash } from "crypto";

export type NewsletterResult = "pending" | "already" | "invalid" | "error";

// Where the signup came from, as an EmailOctopus tag. Lets the newsletter compare the form with
// the account nudges, like support_clicks does for the support link.
export type NewsletterSource = "website" | "signup" | "dashboard";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// A pending contact younger than this is a double click or an impatient retry, not a lost email:
// keep it, so a second submit does not fire a second confirmation right after the first.
const RESEND_AFTER_MS = 10 * 60_000;

export async function subscribeToNewsletter(email: string, source: NewsletterSource): Promise<NewsletterResult> {
  const address = email.trim();
  if (!EMAIL.test(address) || address.length > 254) return "invalid";

  const apiKey = process.env.EMAILOCTOPUS_API_KEY;
  const listId = process.env.EMAILOCTOPUS_LIST_ID;
  if (!apiKey || !listId) {
    console.error("newsletter: EMAILOCTOPUS_API_KEY or EMAILOCTOPUS_LIST_ID missing");
    return "error";
  }

  const contacts = `https://api.emailoctopus.com/lists/${listId}/contacts`;
  const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
  const create = () =>
    fetch(contacts, { method: "POST", headers, body: JSON.stringify({ email_address: address, tags: [source] }) });

  try {
    const res = await create();
    if (res.status === 201) return "pending";
    if (res.status === 422) return "invalid";
    if (res.status !== 409) {
      console.error("newsletter: EmailOctopus answered", res.status, await res.text());
      return "error";
    }

    // Already on the list. Subscribed stays as is, and we do not re-subscribe someone who
    // unsubscribed (that needs fresh consent through EmailOctopus's own flow). Only an old pending
    // contact is re-created, so EmailOctopus sends a new confirmation email.
    // EmailOctopus accepts the MD5 of the lowercased address as the contact id.
    const contact = `${contacts}/${createHash("md5").update(address.toLowerCase()).digest("hex")}`;
    const existing = await fetch(contact, { headers });
    if (!existing.ok) return "already";
    const { status, created_at } = (await existing.json()) as { status?: string; created_at?: string };
    const age = created_at ? Date.now() - Date.parse(created_at) : 0;
    if (status !== "pending" || !(age > RESEND_AFTER_MS)) return "already";

    const removed = await fetch(contact, { method: "DELETE", headers });
    if (removed.status !== 204) {
      console.error("newsletter: deleting pending contact failed", removed.status);
      return "already";
    }
    const again = await create();
    if (again.status === 201) return "pending";
    console.error("newsletter: re-creating pending contact failed", again.status, await again.text());
    return "error";
  } catch (error) {
    console.error("newsletter: request failed", error instanceof Error ? error.message : error);
    return "error";
  }
}
