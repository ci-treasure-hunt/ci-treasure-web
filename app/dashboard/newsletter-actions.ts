"use server";

import { revalidatePath } from "next/cache";

import { removePendingContact, subscribeToNewsletter, type NewsletterResult } from "@/lib/newsletter";
import { createClient } from "@/lib/supabase/server";

import { newsletterState, setNewsletterState, subscribeAccount } from "./newsletter";

// I-160 rider: the dashboard offer and the confirmation reminder. All act only on the signed-in
// user's own account and address.

export async function subscribeMe(): Promise<NewsletterResult> {
  const {
    data: { user },
  } = await (await createClient()).auth.getUser();
  if (!user) return "error";
  const result = await subscribeAccount(user, "dashboard");
  revalidatePath("/dashboard");
  return result;
}

// "Send it again" on the reminder: a repeat signup, which re-creates the pending contact so
// EmailOctopus sends a fresh confirmation (lib/newsletter.ts). No revalidate: the box stays up
// with its "sent" note, and the next visit hides it while the new contact is younger than 10 minutes.
export async function resendConfirmation(): Promise<NewsletterResult> {
  const {
    data: { user },
  } = await (await createClient()).auth.getUser();
  if (!user?.email || newsletterState(user) !== "subscribed") return "error";
  return subscribeToNewsletter(user.email, "dashboard");
}

export async function declineNewsletter(): Promise<void> {
  const {
    data: { user },
  } = await (await createClient()).auth.getUser();
  if (!user) return;
  // From the reminder: drop the never-confirmed contact too, so nothing is left pending.
  if (user.email && newsletterState(user) === "subscribed") await removePendingContact(user.email);
  await setNewsletterState(user, "declined");
  revalidatePath("/dashboard");
}
