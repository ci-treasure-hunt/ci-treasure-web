import Link from "next/link";
import { revalidatePath } from "next/cache";

import { COMMUNITY_STATUSES, COMMUNITY_TYPES } from "@/lib/admin-communities";
import { requireAdminUser } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";

type AdminCommunityRow = {
  id: string;
  name: string;
  slug: string | null;
  type: string | null;
  city: string | null;
  country: string | null;
  status: string;
  activity_level: string | null;
  has_invites: boolean;
  deleted_at: string | null;
  updated_at: string;
};

// Archive = soft delete (deleted_at), replacing Airtable's "Status: Archived". The public read
// policy hides soft-deleted rows, so the page 404s; restoring brings it back unchanged.
async function setArchived(formData: FormData) {
  "use server";

  await requireAdminUser();
  const id = String(formData.get("communityId") ?? "");
  const archive = String(formData.get("archive") ?? "") === "true";
  if (!id) throw new Error("Missing community id.");

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("communities")
    .update({ deleted_at: archive ? new Date().toISOString() : null })
    .eq("id", id)
    .select("slug")
    .single();
  if (error) throw new Error(error.message);

  revalidatePath("/admin/communities");
  revalidatePath("/communities");
  if (data?.slug) revalidatePath(`/communities/${data.slug}`);
}

export default async function AdminCommunitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[]; type?: string; archived?: string; q?: string }>;
}) {
  await requireAdminUser();

  const { status, type, archived, q } = await searchParams;
  const requestedStatuses = status === undefined ? [] : Array.isArray(status) ? status : [status];
  const selectedStatuses = requestedStatuses.length > 0 ? requestedStatuses : ["published", "pending"];
  const showArchived = archived === "1";
  const selectedType = (COMMUNITY_TYPES as readonly string[]).includes(type ?? "") ? type! : "";
  const query = (q ?? "").trim();

  const supabase = createAdminClient();
  let dbQuery = supabase
    .from("communities")
    .select("id, name, slug, type, city, country, status, activity_level, has_invites, deleted_at, updated_at")
    .in("status", selectedStatuses)
    .order("country", { ascending: true, nullsFirst: true })
    .order("name", { ascending: true });

  dbQuery = showArchived ? dbQuery.not("deleted_at", "is", null) : dbQuery.is("deleted_at", null);
  if (selectedType) dbQuery = dbQuery.eq("type", selectedType);
  if (query) {
    // Same guard as /admin/venues: , and () are PostgREST .or() syntax.
    const safeQuery = query.replace(/[,()]/g, " ").trim();
    if (safeQuery) dbQuery = dbQuery.or(`name.ilike.%${safeQuery}%,city.ilike.%${safeQuery}%`);
  }

  const { data, error } = await dbQuery;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as AdminCommunityRow[];
  const { count: pendingCount } = await supabase
    .from("communities")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending")
    .is("deleted_at", null);
  const { count: editCount } = await supabase
    .from("community_edit_suggestions")
    .select("id", { count: "exact", head: true })
    .eq("status", "open");
  const { count: photoCount } = await supabase
    .from("community_photo_submissions")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  return (
    <section className="rounded-[1.75rem] border border-white/80 bg-white/90 p-5 shadow-[0_18px_55px_rgba(106,75,25,0.08)]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-(--color-pine)">Communities</p>
          <h2 className="mt-2 font-serif text-3xl text-slate-950">Manage communities</h2>
          <p className="mt-1 text-sm text-slate-600">
            {rows.length} shown{showArchived ? " (archived)" : ""}.
            {pendingCount ? (
              <>
                {" "}
                <Link href="/admin/communities/pending" className="font-semibold text-amber-700 underline">
                  {pendingCount} pending review →
                </Link>
              </>
            ) : null}
            {" "}
            <Link href="/admin/communities/edits" className={editCount ? "font-semibold text-amber-700 underline" : "underline"}>
              {editCount ? `${editCount} edit suggestion${editCount === 1 ? "" : "s"} →` : "Edit suggestions"}
            </Link>
            {" "}
            <Link href="/admin/communities/photos" className={photoCount ? "font-semibold text-amber-700 underline" : "underline"}>
              {photoCount ? `${photoCount} photo${photoCount === 1 ? "" : "s"} to review →` : "Photos"}
            </Link>
          </p>
        </div>
        <Link href="/admin/communities/new" className="rounded-full bg-(--color-ink) px-5 py-3 text-sm font-semibold text-(--color-mist)">
          New community
        </Link>
      </div>

      <form method="get" className="mt-4 flex flex-wrap items-center gap-4 rounded-2xl border border-(--color-sand-strong) bg-(--color-mist) p-4">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">status</span>
        {COMMUNITY_STATUSES.map((s) => (
          <label key={s} className="flex items-center gap-1.5 text-sm text-slate-800">
            <input type="checkbox" name="status" value={s} defaultChecked={selectedStatuses.includes(s)} />
            {s}
          </label>
        ))}
        <select name="type" defaultValue={selectedType} className="rounded-full border border-(--color-sand-strong) bg-white px-3 py-1.5 text-sm">
          <option value="">all types</option>
          {COMMUNITY_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-slate-800">
          <input type="checkbox" name="archived" value="1" defaultChecked={showArchived} />
          archived only
        </label>
        <input
          type="text"
          name="q"
          defaultValue={query}
          placeholder="Search name or city..."
          className="rounded-full border border-(--color-sand-strong) bg-white px-4 py-1.5 text-sm"
        />
        <button type="submit" className="rounded-full bg-(--color-ink) px-4 py-1.5 text-xs font-semibold text-(--color-mist)">
          Apply
        </button>
      </form>

      <div className="mt-6 overflow-x-auto pb-2">
        <div className="space-y-3 lg:min-w-[1080px]">
          <div className="hidden grid-cols-[minmax(220px,3fr)_150px_70px_170px_90px_240px] gap-3 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 lg:grid">
            <div>name</div>
            <div>city</div>
            <div>country</div>
            <div>type</div>
            <div>status</div>
            <div>actions</div>
          </div>

          {rows.map((c) => (
            <div key={c.id} className="rounded-2xl bg-(--color-mist) p-4 text-sm text-slate-900 shadow-[0_10px_30px_rgba(106,75,25,0.05)]">
              <div className="grid gap-4 lg:grid-cols-[minmax(220px,3fr)_150px_70px_170px_90px_240px] lg:items-center">
                <DetailItem label="name" value={c.name + (c.has_invites ? " 🔒" : "")} strong truncate />
                <DetailItem label="city" value={c.city ?? ""} />
                <DetailItem label="country" value={c.country ?? "world"} />
                <DetailItem label="type" value={c.type ?? ""} />
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 lg:hidden">status</p>
                  <span
                    className={`mt-1 inline-block rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.18em] lg:mt-0 ${
                      c.status === "pending"
                        ? "border-amber-200 bg-amber-50 text-amber-700"
                        : c.status === "rejected"
                          ? "border-rose-200 bg-rose-50 text-rose-700"
                          : "border-(--color-sand-strong)"
                    }`}
                  >
                    {c.status}
                  </span>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 lg:hidden">actions</p>
                  <div className="mt-1 flex flex-wrap gap-2 lg:mt-0">
                    <Link href={`/admin/communities/${c.id}/edit`} className="rounded-full border border-(--color-sand-strong) px-3 py-2 text-xs font-semibold">
                      Edit
                    </Link>
                    {c.status === "published" && !c.deleted_at && c.slug ? (
                      <Link
                        href={`https://citreasurehunt.com/communities/${c.slug}`}
                        target="_blank"
                        className="rounded-full border border-(--color-sand-strong) px-3 py-2 text-xs font-semibold"
                      >
                        View live
                      </Link>
                    ) : null}
                    <form action={setArchived}>
                      <input type="hidden" name="communityId" value={c.id} />
                      <input type="hidden" name="archive" value={String(!c.deleted_at)} />
                      <button type="submit" className="rounded-full border border-(--color-sand-strong) px-3 py-2 text-xs font-semibold">
                        {c.deleted_at ? "Restore" : "Archive"}
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {rows.length === 0 ? <p className="px-3 py-6 text-sm text-slate-500">No communities match this filter.</p> : null}
        </div>
      </div>
    </section>
  );
}

function DetailItem({
  label,
  value,
  strong = false,
  truncate = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
  truncate?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 lg:hidden">{label}</p>
      <p className={`mt-1 lg:mt-0 ${strong ? "font-medium leading-snug" : ""} ${truncate ? "lg:truncate" : ""}`}>{value}</p>
    </div>
  );
}
