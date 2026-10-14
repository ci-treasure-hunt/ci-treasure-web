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

// Counted in review units, matching the pending queue: a series' pending dates are one card
// there (I-171), so they count once here too. `series` drives the Series pill.
async function getPendingEventCounts(): Promise<{ units: number; series: number }> {
  try {
    const supabase = createAdminClient();
    const { data } = await supabase.from("events").select("series_id").eq("status", "pending");
    const rows = data ?? [];
    const seriesIds = new Set(rows.map((r) => r.series_id as string | null).filter((id): id is string => Boolean(id)));
    return { units: rows.filter((r) => !r.series_id).length + seriesIds.size, series: seriesIds.size };
  } catch {
    return { units: 0, series: 0 };
  }
}

// Was missing until 2026-10-15: the Claims badge counted profile claims only, so a pending
// event claim never showed a number.
async function getPendingEventClaimCount(): Promise<number> {
  try {
    const supabase = createAdminClient();
    const { count } = await supabase
      .from("event_claims")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");
    return count ?? 0;
  } catch {
    return 0;
  }
}

async function getPendingCommunityCount(): Promise<number> {
  try {
    const supabase = createAdminClient();
    const { count } = await supabase
      .from("communities")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .is("deleted_at", null);
    return count ?? 0;
  } catch {
    return 0;
  }
}

async function getOpenCommunityEditCount(): Promise<number> {
  try {
    const supabase = createAdminClient();
    const { count } = await supabase
      .from("community_edit_suggestions")
      .select("id", { count: "exact", head: true })
      .eq("status", "open");
    return count ?? 0;
  } catch {
    return 0;
  }
}

async function getPendingCommunityPhotoCount(): Promise<number> {
  try {
    const supabase = createAdminClient();
    const { count } = await supabase
      .from("community_photo_submissions")
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

const manageLinkClass =
  "relative rounded-full border border-(--color-sand-strong) px-4 py-2 hover:border-(--color-pine) hover:text-(--color-pine)";

function NavBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white">
      {count > 9 ? "9+" : count}
    </span>
  );
}

// One chip per review queue, named by what it reviews, count inline. Empty queues stay visible
// but muted, so the row keeps its shape and each queue is always one click away. Reorganized
// 2026-10-15: the old single row mixed content sections with queues ("Pending", "Claims",
// "Photos", "Profiles") without saying which entity each was about.
function ReviewChip({ href, label, count }: { href: string; label: string; count: number }) {
  const active = count > 0;
  return (
    <Link
      href={href}
      className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
        active
          ? "border-amber-300 bg-amber-50 text-amber-900 hover:border-amber-500"
          : "border-(--color-sand-strong) text-slate-400 hover:border-(--color-pine) hover:text-(--color-pine)"
      }`}
    >
      {label}
      <span className={`rounded-full px-1.5 text-[11px] ${active ? "bg-amber-500 text-white" : "bg-slate-100 text-slate-400"}`}>
        {count}
      </span>
    </Link>
  );
}

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const adminUser = await getAdminUser();
  const [
    openReports,
    pendingClaims,
    pendingEventClaims,
    pendingEvents,
    pendingPhotos,
    pendingProfiles,
    pendingCommunities,
    communityEdits,
    communityPhotos,
  ] = adminUser
    ? await Promise.all([
        getOpenReportCount(),
        getPendingClaimCount(),
        getPendingEventClaimCount(),
        getPendingEventCounts(),
        getPendingPhotoCount(),
        getPendingProfileCount(),
        getPendingCommunityCount(),
        getOpenCommunityEditCount(),
        getPendingCommunityPhotoCount(),
      ])
    : [0, 0, 0, { units: 0, series: 0 }, 0, 0, 0, 0, 0];

  const reviewQueues = [
    { href: "/admin/events/pending", label: "New events", count: pendingEvents.units },
    { href: "/admin/profiles/pending", label: "New profiles", count: pendingProfiles },
    { href: "/admin/claims#profile-claims", label: "Profile claims", count: pendingClaims },
    { href: "/admin/claims#event-claims", label: "Event claims", count: pendingEventClaims },
    { href: "/admin/profile-photos", label: "Profile photos", count: pendingPhotos },
    { href: "/admin/communities/pending", label: "New communities", count: pendingCommunities },
    { href: "/admin/communities/edits", label: "Community edits", count: communityEdits },
    { href: "/admin/communities/photos", label: "Community photos", count: communityPhotos },
    { href: "/admin/reports", label: "Reports", count: openReports },
  ];

  return (
    <main className="min-h-screen bg-(--color-mist) px-5 py-6 text-slate-900 sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="flex flex-col gap-4 rounded-[1.75rem] border border-white/80 bg-white/85 p-5 shadow-[0_18px_55px_rgba(106,75,25,0.08)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.28em] text-(--color-pine)">Admin</p>
              <h1 className="mt-2 font-serif text-3xl text-slate-950">CI Treasure Hunt</h1>
            </div>
            <nav aria-label="Manage" className="flex flex-wrap gap-3 text-sm font-medium text-slate-700">
              <Link href="/admin/events" className={manageLinkClass}>
                Events
              </Link>
              <Link href="/admin/series" className={manageLinkClass}>
                Series
                <NavBadge count={pendingEvents.series} />
              </Link>
              <Link href="/admin/venues" className={manageLinkClass}>
                Venues
              </Link>
              <Link href="/admin/communities" className={manageLinkClass}>
                Communities
              </Link>
              {adminUser ? (
                <form action={signOut}>
                  <button type="submit" className={manageLinkClass}>
                    Sign out
                  </button>
                </form>
              ) : null}
            </nav>
          </div>
          {adminUser ? (
            <nav aria-label="To review" className="flex flex-wrap items-center gap-2 border-t border-(--color-sand-strong) pt-4">
              <span className="mr-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">To review</span>
              {reviewQueues.map((q) => (
                <ReviewChip key={q.label} {...q} />
              ))}
            </nav>
          ) : null}
        </header>
        {children}
      </div>
    </main>
  );
}
