import { redirect } from "next/navigation";

import { isAdminEmail } from "@/lib/admin-emails";
import { createClient } from "@/lib/supabase/server";

export type AdminUser = {
  email: string;
};

export async function getSessionUserEmail() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user?.email?.trim().toLowerCase() ?? null;
}

export async function getAdminUser(): Promise<AdminUser | null> {
  const email = await getSessionUserEmail();
  if (!isAdminEmail(email)) {
    return null;
  }
  return { email: email! };
}

export async function requireAdminUser() {
  const user = await getAdminUser();
  if (!user) {
    redirect("/admin/login");
  }
  return user;
}

// Re-exported so existing importers of "@/lib/admin-auth" keep working unchanged.
export { isAdminEmail };
