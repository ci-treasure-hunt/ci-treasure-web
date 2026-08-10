import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { ClaimSearch } from "./claim-search";
import { ClaimConfirm } from "./claim-confirm";
import { getClaimableProfileById } from "./actions";

export default async function ClaimPage({
  searchParams,
}: {
  searchParams?: Promise<{ profile?: string }>;
}) {
  const { profile: profileId } = (await searchParams) ?? {};

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const next = profileId ? `/dashboard/claim?profile=${profileId}` : "/dashboard/claim";
    redirect(`/auth?next=${encodeURIComponent(next)}`);
  }

  // Already owns a profile, or already has a claim pending → the dashboard is the
  // right place (it renders the appropriate state). Don't show search again.
  const { data: owned } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (owned) {
    redirect("/dashboard");
  }
  const { data: pending } = await supabase
    .from("profiles")
    .select("id")
    .eq("claim_pending_user_id", user.id)
    .maybeSingle();
  if (pending) {
    redirect("/dashboard");
  }

  // Deep-link case (CTA #3 on a profile page): a specific, genuinely-unclaimed profile
  // skips straight to a confirm view. Missing/invalid/already-claimed falls back to search.
  const deepLinkProfile = profileId ? await getClaimableProfileById(profileId) : null;

  return (
    <main className="min-h-screen bg-(--color-mist) px-5 py-10 text-slate-900 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-2xl">
        <Link href="/dashboard" className="text-sm font-medium text-(--color-pine) hover:underline">
          ← Back to dashboard
        </Link>
        <div className="mt-4 rounded-[1.75rem] border border-white/80 bg-white/90 p-8 shadow-[0_18px_55px_rgba(106,75,25,0.08)]">
          {deepLinkProfile ? (
            <>
              <p className="text-sm font-semibold uppercase tracking-[0.28em] text-(--color-pine)">Claim your profile</p>
              <h1 className="mt-3 font-serif text-4xl text-slate-950">Is this you?</h1>
              <div className="mt-8">
                <ClaimConfirm profile={deepLinkProfile} />
              </div>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold uppercase tracking-[0.28em] text-(--color-pine)">Already listed</p>
              <h1 className="mt-3 font-serif text-4xl text-slate-950">Find yourself in the directory</h1>
              <p className="mt-4 text-base leading-7 text-slate-700">
                Search for your name below. If you find yourself, claim it, an admin will review the claim. If you
                don&apos;t see yourself, you can add a new profile instead.
              </p>
              <div className="mt-8">
                <ClaimSearch />
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
