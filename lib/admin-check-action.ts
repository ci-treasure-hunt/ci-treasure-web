"use server";

import { getAdminUser } from "@/lib/admin-auth";

// For the site header's "Admin" link only: ADMIN_EMAIL is a server-side env var, so the client
// header asks. Tells a signed-in user nothing beyond whether they themselves are an admin, and
// every /admin page still checks requireAdminUser() on its own, so this gates a link, not access.
export async function isCurrentUserAdmin(): Promise<boolean> {
  return (await getAdminUser()) != null;
}
