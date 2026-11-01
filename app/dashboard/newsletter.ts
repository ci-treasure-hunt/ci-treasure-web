// I-160 rider: newsletter state per account, kept in auth user_metadata so it needs no table.
//   newsletter_optin: true        set at sign-up when the /auth box was ticked (app/auth/page.tsx)
//   newsletter: "subscribed"      passed to EmailOctopus (pending until they confirm there, or already on it)
//   newsletter: "confirmed"       EmailOctopus has it as subscribed; stops the status checks below
//   newsletter: "unsubscribed"    EmailOctopus has it as unsubscribed; never offered or reminded again
//   newsletter: "declined"        "No thanks" on the dashboard offer or reminder; never asked again
// Server-only, no "use server": called from the dashboard page and app/dashboard/newsletter-actions.ts,
// both of which have the signed-in user already.

import type { User } from "@supabase/supabase-js";

import {
  contactStatus,
  RESEND_AFTER_MS,
  subscribeToNewsletter,
  type NewsletterResult,
  type NewsletterSource,
} from "@/lib/newsletter";
import { createAdminClient } from "@/lib/supabase/admin";

export type NewsletterState = "subscribed" | "confirmed" | "unsubscribed" | "declined";

const STATES: readonly string[] = ["subscribed", "confirmed", "unsubscribed", "declined"];

export function newsletterState(user: User): NewsletterState | null {
  const value = user.user_metadata?.newsletter;
  return STATES.includes(value) ? (value as NewsletterState) : null;
}

// null clears the state (and the sign-up box), so the dashboard offer shows again.
export async function setNewsletterState(user: User, state: NewsletterState | null) {
  // Spread the existing metadata: the admin update replaces user_metadata as a whole.
  // Explicit null/false rather than deleted keys, so this holds whether the update merges or replaces.
  const metadata: Record<string, unknown> = { ...user.user_metadata, newsletter: state };
  if (state === null) metadata.newsletter_optin = false;
  await createAdminClient().auth.admin.updateUserById(user.id, { user_metadata: metadata });
}

// Subscribes the account's own, sign-in-verified address. Records "subscribed" only when
// EmailOctopus took it (or already had it), so a failure leaves the offer in place to retry.
export async function subscribeAccount(user: User, source: NewsletterSource): Promise<NewsletterResult> {
  if (!user.email) return "invalid";
  const result = await subscribeToNewsletter(user.email, source);
  if (result === "pending" || result === "already") await setNewsletterState(user, "subscribed");
  return result;
}

// The sign-up box, carried out on the first dashboard visit after the address was proven.
export async function completeSignupOptin(user: User): Promise<NewsletterResult | null> {
  if (user.user_metadata?.newsletter_optin !== true || newsletterState(user)) return null;
  return subscribeAccount(user, "signup");
}

// "subscribed" only means EmailOctopus took the address; 4 of 15 dashboard signups up to
// 2026-11-01 never clicked the confirmation email. While that is open, ask EmailOctopus on each
// visit and settle the state once it has an answer, so the lookup stops after confirmation.
// True means: still pending and old enough that the confirmation email has had its chance.
export async function needsNewsletterConfirmation(user: User): Promise<boolean> {
  if (newsletterState(user) !== "subscribed" || !user.email) return false;
  const current = await contactStatus(user.email);
  if (current === null) return false; // EmailOctopus unreachable: show nothing, ask next time
  if (current === "missing") {
    await setNewsletterState(user, null); // removed from the list: offer it fresh next visit
    return false;
  }
  if (current.status === "subscribed") await setNewsletterState(user, "confirmed");
  if (current.status === "unsubscribed") await setNewsletterState(user, "unsubscribed");
  return current.status === "pending" && Date.now() - current.createdAt.getTime() > RESEND_AFTER_MS;
}
