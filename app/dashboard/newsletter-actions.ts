"use server";

import { revalidatePath } from "next/cache";

import type { NewsletterResult } from "@/lib/newsletter";
import { createClient } from "@/lib/supabase/server";

import { setNewsletterState, subscribeAccount } from "./newsletter";

// I-160 rider: the dashboard offer. Both act only on the signed-in user's own account and address.

export async function subscribeMe(): Promise<NewsletterResult> {
  const {
    data: { user },
  } = await (await createClient()).auth.getUser();
  if (!user) return "error";
  const result = await subscribeAccount(user, "dashboard");
  revalidatePath("/dashboard");
  return result;
}

export async function declineNewsletter(): Promise<void> {
  const {
    data: { user },
  } = await (await createClient()).auth.getUser();
  if (!user) return;
  await setNewsletterState(user, "declined");
  revalidatePath("/dashboard");
}
