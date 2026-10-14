// I-160 rider: newsletter state per account, kept in auth user_metadata so it needs no table.
//   newsletter_optin: true   set at sign-up when the /auth box was ticked (app/auth/page.tsx)
//   newsletter: "subscribed" passed to EmailOctopus (pending until they confirm there, or already on it)
//   newsletter: "declined"   "No thanks" on the dashboard offer; never asked again
// Server-only, no "use server": called from the dashboard page and app/dashboard/newsletter-actions.ts,
// both of which have the signed-in user already.

import type { User } from "@supabase/supabase-js";

import { subscribeToNewsletter, type NewsletterResult, type NewsletterSource } from "@/lib/newsletter";
import { createAdminClient } from "@/lib/supabase/admin";

export type NewsletterState = "subscribed" | "declined";

export function newsletterState(user: User): NewsletterState | null {
  const value = user.user_metadata?.newsletter;
  return value === "subscribed" || value === "declined" ? value : null;
}

export async function setNewsletterState(user: User, state: NewsletterState) {
  // Spread the existing metadata: the admin update replaces user_metadata as a whole.
  await createAdminClient().auth.admin.updateUserById(user.id, {
    user_metadata: { ...user.user_metadata, newsletter: state },
  });
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
