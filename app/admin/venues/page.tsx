import Link from "next/link";
import { revalidatePath } from "next/cache";

import { VENUE_LEVELS, venueLevel, venueLevelColumns, type VenueLevel } from "@/lib/admin-venues";
import { requireAdminUser } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";

type AdminVenueRow = {
  id: string;
  name: string;
  slug: string;
  city: string;
  country: string;
  visibility: string;
  show_in_list: boolean;
  show_in_announce: boolean;
  image_url: string | null;
  website: string | null;
  source: string | null;
  created_at: string;
};

const VISIBILITY_OPTIONS = ["public", "hidden"] as const;
const DEFAULT_VISIBILITIES = ["public", "hidden"] as const;

// I-181: where a venue came from, as shown in the list. Admin-made rows aren't labelled.
const SOURCE_LABELS: Record<string, string> = {
  event_form: "from an event",
  venue_form: "submitted",
  addvenue: "addvenue",
};

async function setLevel(formData: FormData) {
  "use server";

  await requireAdminUser();
  const venueId = String(formData.get("venueId") ?? "");
  const level = String(formData.get("level") ?? "") as VenueLevel;
  if (!venueId || !VENUE_LEVELS.some((l) => l.value === level)) throw new Error("Missing venue or level.");

  const { visibility, showInList } = venueLevelColumns(level);
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("venues")
    .update({ visibility, show_in_list: showInList, updated_at: new Date().toISOString() })
    .eq("id", venueId);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/venues");
  revalidatePath("/venues");
}

export default async function AdminVenuesPage({
  searchParams,
}: {
  searchParams: Promise<{ visibility?: string | string[]; q?: string; new?: string }>;
}) {
  await requireAdminUser();

  const { visibility, q, new: newOnly } = await searchParams;
  const requestedVisibilities = visibility === undefined ? [] : Array.isArray(visibility) ? visibility : [visibility];
  const selectedVisibilities = requestedVisibilities.length > 0 ? requestedVisibilities : [...DEFAULT_VISIBILITIES];
  const query = (q ?? "").trim();
  // ?new=1, linked from the Telegram ping: venues that came from organizers, newest first.
  const showNew = newOnly === "1";

  const supabase = createAdminClient();
  let dbQuery = supabase
    .from("venues")
    .select("id, name, slug, city, country, visibility, show_in_list, show_in_announce, image_url, website, source, created_at")
    .in("visibility", selectedVisibilities);
  dbQuery = showNew
    ? dbQuery.in("source", ["event_form", "venue_form"]).order("created_at", { ascending: false })
    : dbQuery.order("country", { ascending: true }).order("name", { ascending: true });

  if (query) {
    // PostgREST's .or() filter string uses `,` to separate conditions and `()` to group —
    // a search value containing those (e.g. "Smith, John's Studio") would otherwise break
    // out of the intended two-column filter. Strip them rather than trying to escape, since
    // this is a free-text name/city search box, not a place where that punctuation carries
    // meaning worth preserving.
    const safeQuery = query.replace(/[,()]/g, " ").trim();
    if (safeQuery) {
      dbQuery = dbQuery.or(`name.ilike.%${safeQuery}%,city.ilike.%${safeQuery}%`);
    }
  }

  const { data: venues, error } = await dbQuery;
  if (error) {
    throw new Error(error.message);
  }

  const rows = venues as AdminVenueRow[];
  const listedCount = rows.filter((v) => v.show_in_list).length;

  return (
    <section className="rounded-[1.75rem] border border-white/80 bg-white/90 p-5 shadow-[0_18px_55px_rgba(106,75,25,0.08)]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-(--color-pine)">Venues</p>
          <h2 className="mt-2 font-serif text-3xl text-slate-950">Manage venues</h2>
          <p className="mt-1 text-sm text-slate-600">
            {rows.length} shown · {listedCount} on the /venues directory. Curation stays manual, one venue at a
            time — flipping &quot;on list&quot; is a deliberate call, not a bulk operation.
          </p>
        </div>
        <Link href="/admin/venues/new" className="rounded-full bg-(--color-ink) px-5 py-3 text-sm font-semibold text-(--color-mist)">
          New venue
        </Link>
      </div>

      <form
        method="get"
        className="mt-4 flex flex-wrap items-center gap-4 rounded-2xl border border-(--color-sand-strong) bg-(--color-mist) p-4"
      >
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">visibility</span>
        {VISIBILITY_OPTIONS.map((v) => (
          <label key={v} className="flex items-center gap-1.5 text-sm text-slate-800">
            <input type="checkbox" name="visibility" value={v} defaultChecked={selectedVisibilities.includes(v)} />
            {v}
          </label>
        ))}
        <input
          type="text"
          name="q"
          defaultValue={query}
          placeholder="Search name or city..."
          className="rounded-full border border-(--color-sand-strong) bg-white px-4 py-1.5 text-sm"
        />
        <label className="flex items-center gap-1.5 text-sm text-slate-800">
          <input type="checkbox" name="new" value="1" defaultChecked={showNew} />
          from organizers, newest first
        </label>
        <button
          type="submit"
          className="rounded-full bg-(--color-ink) px-4 py-1.5 text-xs font-semibold text-(--color-mist)"
        >
          Apply
        </button>
      </form>

      <div className="mt-6 overflow-x-auto pb-2">
        <div className="space-y-3 lg:min-w-[1080px]">
          <div className="hidden grid-cols-[minmax(200px,3fr)_120px_70px_230px_150px_170px] gap-3 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 lg:grid">
            <div>name</div>
            <div>city</div>
            <div>country</div>
            <div>level</div>
            <div>source</div>
            <div>actions</div>
          </div>

          {rows.map((venue) => (
            <div
              key={venue.id}
              className="rounded-2xl bg-(--color-mist) p-4 text-sm text-slate-900 shadow-[0_10px_30px_rgba(106,75,25,0.05)]"
            >
              <div className="grid gap-4 lg:grid-cols-[minmax(200px,3fr)_120px_70px_230px_150px_170px] lg:items-center">
                <DetailItem label="name" value={venue.name} strong truncate />
                <DetailItem label="city" value={venue.city} />
                <DetailItem label="country" value={venue.country} />
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 lg:hidden">level</p>
                  <form action={setLevel} className="mt-1 flex flex-wrap items-center gap-2 lg:mt-0">
                    <input type="hidden" name="venueId" value={venue.id} />
                    <select
                      name="level"
                      defaultValue={venueLevel(venue.visibility, venue.show_in_list)}
                      className="rounded-full border border-(--color-sand-strong) bg-white px-2 py-1 text-xs font-semibold"
                    >
                      {VENUE_LEVELS.map((level) => (
                        <option key={level.value} value={level.value}>
                          {level.value}
                        </option>
                      ))}
                    </select>
                    <button type="submit" className="text-xs font-semibold text-(--color-pine) hover:underline">
                      Set
                    </button>
                    {venue.visibility === "public" && !venue.website ? (
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
                        no website
                      </span>
                    ) : null}
                  </form>
                </div>
                <DetailItem
                  label="source"
                  value={
                    venue.source && SOURCE_LABELS[venue.source]
                      ? `${SOURCE_LABELS[venue.source]} · ${venue.created_at.slice(0, 10)}`
                      : "—"
                  }
                />
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 lg:hidden">actions</p>
                  <div className="mt-1 flex flex-wrap gap-2 lg:mt-0">
                    <Link href={`/admin/venues/${venue.id}/edit`} className="rounded-full border border-(--color-sand-strong) px-3 py-2 text-xs font-semibold">
                      Edit
                    </Link>
                    {venue.visibility === "public" ? (
                      <Link
                        href={`https://citreasurehunt.com/venues/${venue.slug}`}
                        target="_blank"
                        className="rounded-full border border-(--color-sand-strong) px-3 py-2 text-xs font-semibold"
                      >
                        View live
                      </Link>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          ))}

          {rows.length === 0 ? <p className="px-3 py-6 text-sm text-slate-500">No venues match this filter.</p> : null}
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
      <p className={`mt-1 lg:mt-0 ${strong ? "font-medium leading-snug" : ""} ${truncate ? "lg:truncate" : ""}`}>
        {value}
      </p>
    </div>
  );
}
