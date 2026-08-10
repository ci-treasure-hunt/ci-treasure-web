import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export type AdminUser = {
  email: string;
};

// Returns null rather than throwing when unset: isAdminEmail() below is called from
// /dashboard on every page load (not just admin pages), so a missing env var must fail
// closed (nobody is admin) instead of crashing the dashboard for every signed-in user.
function getAdminEmail() {
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  return adminEmail || null;
}

export async function getSessionUserEmail() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user?.email?.trim().toLowerCase() ?? null;
}

export async function getAdminUser(): Promise<AdminUser | null> {
  const email = await getSessionUserEmail();
  if (!email || email !== getAdminEmail()) {
    return null;
  }
  return { email };
}

export async function requireAdminUser() {
  const user = await getAdminUser();
  if (!user) {
    redirect("/admin/login");
  }
  return user;
}

export async function isAdminEmail(email: string | null | undefined) {
  return Boolean(email && email.trim().toLowerCase() === getAdminEmail());
}
