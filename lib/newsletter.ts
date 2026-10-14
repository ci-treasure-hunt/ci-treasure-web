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

export type NewsletterResult = "pending" | "already" | "invalid" | "error";

// Where the signup came from, as an EmailOctopus tag. Lets the newsletter compare the form with
// the account nudges, like support_clicks does for the support link.
export type NewsletterSource = "website" | "signup" | "dashboard";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function subscribeToNewsletter(email: string, source: NewsletterSource): Promise<NewsletterResult> {
  const address = email.trim();
  if (!EMAIL.test(address) || address.length > 254) return "invalid";

  const apiKey = process.env.EMAILOCTOPUS_API_KEY;
  const listId = process.env.EMAILOCTOPUS_LIST_ID;
  if (!apiKey || !listId) {
    console.error("newsletter: EMAILOCTOPUS_API_KEY or EMAILOCTOPUS_LIST_ID missing");
    return "error";
  }

  try {
    const res = await fetch(`https://api.emailoctopus.com/lists/${listId}/contacts`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email_address: address, tags: [source] }),
    });
    if (res.status === 201) return "pending";
    // Already on the list: subscribed, pending or unsubscribed. We do not re-subscribe someone who
    // unsubscribed; that needs fresh consent through EmailOctopus's own flow.
    if (res.status === 409) return "already";
    if (res.status === 422) return "invalid";
    console.error("newsletter: EmailOctopus answered", res.status, await res.text());
    return "error";
  } catch (error) {
    console.error("newsletter: request failed", error instanceof Error ? error.message : error);
    return "error";
  }
}
