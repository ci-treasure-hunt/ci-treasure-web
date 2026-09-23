import Link from "next/link";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/admin-auth";
import { createClient } from "@/lib/supabase/server";

async function signOut() {
  "use server";
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}

async function getOpenReportCount(): Promise<number> {
  try {
    const supabase = createAdminClient();
    const { count } = await supabase
      .from("reports")
      .select("id", { count: "exact", head: true })
      .eq("status", "open");
    return count ?? 0;
  } catch {
    return 0;
  }
}

async function getPendingClaimCount(): Promise<number> {
  try {
    const supabase = createAdminClient();
    const { count } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .not("claim_pending_user_id", "is", null);
    return count ?? 0;
  } catch {
    return 0;
  }
}

async function getPendingEventCount(): Promise<number> {
  try {
    const supabase = createAdminClient();
    const { count } = await supabase
      .from("events")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");
    return count ?? 0;
  } catch {
    return 0;
  }
}

async function getPendingProfileCount(): Promise<number> {
  try {
    const supabase = createAdminClient();
    const { count } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("visibility", "shadow")
      .eq("source", "self_submitted");
    return count ?? 0;
  } catch {
    return 0;
  }
}

async function getPendingPhotoCount(): Promise<number> {
  try {
    const supabase = createAdminClient();
    const { count } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("image_status", "pending")
      .not("image_url", "is", null);
    return count ?? 0;
  } catch {
    return 0;
  }
}

function NavBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white">
      {count > 9 ? "9+" : count}
    </span>
  );
}

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const adminUser = await getAdminUser();
  const [openReports, pendingClaims, pendingEvents, pendingPhotos, pendingProfiles] = adminUser
    ? await Promise.all([
        getOpenReportCount(),
        getPendingClaimCount(),
        getPendingEventCount(),
        getPendingPhotoCount(),
        getPendingProfileCount(),
      ])
    : [0, 0, 0, 0, 0];

  return (
    <main className="min-h-screen bg-(--color-mist) px-5 py-6 text-slate-900 sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="flex flex-col gap-4 rounded-[1.75rem] border border-white/80 bg-white/85 p-5 shadow-[0_18px_55px_rgba(106,75,25,0.08)] sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-(--color-pine)">Admin</p>
            <h1 className="mt-2 font-serif text-3xl text-slate-950">CI Treasure Hunt</h1>
            <p className="mt-1 text-sm text-slate-600">Internal tools for event review and curation.</p>
          </div>
          <nav className="flex flex-wrap gap-3 text-sm font-medium text-slate-700">
            <Link href="/admin/events" className="rounded-full border border-(--color-sand-strong) px-4 py-2 hover:border-(--color-pine) hover:text-(--color-pine)">
              Events
            </Link>
            <Link href="/admin/venues" className="rounded-full border border-(--color-sand-strong) px-4 py-2 hover:border-(--color-pine) hover:text-(--color-pine)">
              Venues
            </Link>
            <Link href="/admin/communities" className="rounded-full border border-(--color-sand-strong) px-4 py-2 hover:border-(--color-pine) hover:text-(--color-pine)">
              Communities
            </Link>
            <Link href="/admin/events/pending" className="relative rounded-full border border-(--color-sand-strong) px-4 py-2 hover:border-(--color-pine) hover:text-(--color-pine)">
              Pending
              <NavBadge count={pendingEvents} />
            </Link>
            <Link href="/admin/claims" className="relative rounded-full border border-(--color-sand-strong) px-4 py-2 hover:border-(--color-pine) hover:text-(--color-pine)">
              Claims
              <NavBadge count={pendingClaims} />
            </Link>
            <Link href="/admin/profiles/pending" className="relative rounded-full border border-(--color-sand-strong) px-4 py-2 hover:border-(--color-pine) hover:text-(--color-pine)">
              Profiles
              <NavBadge count={pendingProfiles} />
            </Link>
            <Link href="/admin/profile-photos" className="relative rounded-full border border-(--color-sand-strong) px-4 py-2 hover:border-(--color-pine) hover:text-(--color-pine)">
              Photos
              <NavBadge count={pendingPhotos} />
            </Link>
            <Link href="/admin/reports" className="relative rounded-full border border-(--color-sand-strong) px-4 py-2 hover:border-(--color-pine) hover:text-(--color-pine)">
              Reports
              <NavBadge count={openReports} />
            </Link>
            {adminUser ? (
              <form action={signOut}>
                <button
                  type="submit"
                  className="rounded-full border border-(--color-sand-strong) px-4 py-2 hover:border-(--color-pine) hover:text-(--color-pine)"
                >
                  Sign out
                </button>
              </form>
            ) : null}
          </nav>
        </header>
        {children}
      </div>
    </main>
  );
}
