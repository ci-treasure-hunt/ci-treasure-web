import { revalidatePath } from "next/cache";
import Link from "next/link";

import { requireAdminUser } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const REASON_LABELS: Record<string, string> = {
  incorrect_info: "Incorrect info",
  spam_fake: "Spam / fake",
  copyright: "Copyright",
  inappropriate_photo: "Inappropriate photo",
  misleading_or_unsafe: "Misleading / safety",
  illegal_other: "Other / illegal",
  privacy_objection: "Privacy objection",
};

async function resolveReport(formData: FormData) {
  "use server";
  await requireAdminUser();
  const id = String(formData.get("id") ?? "");
  const adminNote = String(formData.get("admin_note") ?? "").trim() || null;
  const supabase = createAdminClient();
  await supabase
    .from("reports")
    .update({ status: "resolved", resolved_at: new Date().toISOString(), admin_note: adminNote })
    .eq("id", id);
  revalidatePath("/admin/reports");
}

async function dismissReport(formData: FormData) {
  "use server";
  await requireAdminUser();
  const id = String(formData.get("id") ?? "");
  const adminNote = String(formData.get("admin_note") ?? "").trim() || null;
  const supabase = createAdminClient();
  await supabase
    .from("reports")
    .update({ status: "dismissed", resolved_at: new Date().toISOString(), admin_note: adminNote })
    .eq("id", id);
  revalidatePath("/admin/reports");
}

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  await requireAdminUser();
  const { show } = await searchParams;
  const showAll = show === "all";

  const supabase = createAdminClient();
  const query = supabase
    .from("reports")
    .select("id, entity_type, entity_title, entity_slug, reason, details, status, created_at, admin_note")
    .order("created_at", { ascending: false });

  if (!showAll) query.eq("status", "open");

  const { data: reports, error } = await query;
  if (error) throw new Error(error.message);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-2xl text-slate-950">Reports</h2>
        <Link
          href={showAll ? "/admin/reports" : "/admin/reports?show=all"}
          className="text-sm text-slate-500 underline hover:text-slate-700"
        >
          {showAll ? "Show open only" : "Show all"}
        </Link>
      </div>

      {!reports?.length ? (
        <p className="text-slate-500">No {showAll ? "" : "open "}reports.</p>
      ) : (
        <div className="space-y-4">
          {reports.map((r) => {
            const entityPath =
              r.entity_type === "profile"
                ? `teachers/${r.entity_slug}`
                : `${r.entity_type}s/${r.entity_slug}`;
            return (
              <div
                key={r.id}
                className="rounded-[1.5rem] border border-(--color-sand-strong) bg-white p-5 space-y-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      {r.entity_type}
                    </p>
                    <p className="font-medium text-slate-900">
                      {r.entity_title ?? r.entity_slug}{" "}
                      {r.entity_slug && (
                        <Link
                          href={`/${entityPath}`}
                          target="_blank"
                          className="text-xs text-violet-600 underline"
                        >
                          view ↗
                        </Link>
                      )}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      r.status === "open"
                        ? "bg-amber-100 text-amber-800"
                        : r.status === "resolved"
                        ? "bg-green-100 text-green-800"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {r.status}
                  </span>
                </div>

                <div className="text-sm text-slate-700 space-y-1">
                  <p>
                    <span className="font-medium">Reason:</span>{" "}
                    {REASON_LABELS[r.reason] ?? r.reason}
                  </p>
                  {r.details && (
                    <p>
                      <span className="font-medium">Details:</span> {r.details}
                    </p>
                  )}
                  <p className="text-slate-400 text-xs">
                    {new Date(r.created_at).toLocaleString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>

                {r.status === "open" && (
                  <form className="space-y-2 pt-1">
                    <input type="hidden" name="id" value={r.id} />
                    <input
                      type="text"
                      name="admin_note"
                      defaultValue={r.admin_note ?? ""}
                      placeholder="Admin note (optional)"
                      className="w-full rounded-xl border border-(--color-sand-strong) px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-(--color-pine)"
                    />
                    <div className="flex gap-3">
                      <button
                        formAction={resolveReport}
                        className="rounded-full bg-(--color-pine) px-4 py-1.5 text-sm font-medium text-white hover:opacity-90"
                      >
                        Resolve
                      </button>
                      <button
                        formAction={dismissReport}
                        className="rounded-full border border-(--color-sand-strong) px-4 py-1.5 text-sm font-medium text-slate-600 hover:border-slate-400"
                      >
                        Dismiss
                      </button>
                    </div>
                  </form>
                )}

                {r.admin_note && r.status !== "open" && (
                  <p className="text-xs text-slate-500 italic">Note: {r.admin_note}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
