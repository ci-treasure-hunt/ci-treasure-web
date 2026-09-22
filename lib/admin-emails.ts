// The single source of truth for who counts as an admin.
//
// `ADMIN_EMAIL` was one address compared with `===`, which meant admin was a single person on a
// single device: pointing it at a second address silently removed the first. It now accepts a
// comma-separated list, so a phone-friendly account can be added without giving up the original.
// A value with no comma behaves exactly as before.
//
// Deliberately its own module rather than living in admin-auth.ts. Both the page gate and the
// route-handler gate need it, admin-auth.ts imports next/navigation, and the last time this
// codebase kept two hand-synced copies of a security check (safeNext, I-165 Finding 4) the copies
// drifted and one of them let an open redirect through. One copy, two importers.
//
// Note there is a second, unrelated admin mechanism in the database: `public.user_roles` plus the
// `has_role()` SECURITY DEFINER function referenced by several RLS policies. That table has never
// had a row in it, so those policies currently grant nobody anything, and this env var is the only
// gate with real effect. Worth knowing before trusting an RLS policy that mentions has_role().
function getAdminEmails(): string[] {
  const raw = process.env.ADMIN_EMAIL;
  if (!raw) return [];
  return raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

// Fails closed: an unset or empty ADMIN_EMAIL makes nobody an admin, rather than throwing. This is
// called from /dashboard on every page load, not just admin pages, so a missing env var must not
// crash the dashboard for every signed-in user.
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  return getAdminEmails().includes(normalized);
}
