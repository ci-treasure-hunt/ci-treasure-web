import Link from "next/link";

import { requireAdminUser } from "@/lib/admin-auth";
import { suggestionTypeLabel } from "@/lib/community-suggest-options";

import { getOpenEditSuggestions } from "./actions";
import { ResolveSuggestionActions } from "./resolve-actions";

function age(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400_000);
  return days <= 0 ? "today" : days === 1 ? "1 day ago" : `${days} days ago`;
}

export default async function AdminCommunityEditsPage() {
  await requireAdminUser();
  const suggestions = await getOpenEditSuggestions();

  return (
    <section className="rounded-[1.75rem] border border-white/80 bg-white/90 p-6 shadow-[0_18px_55px_rgba(106,75,25,0.08)]">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-serif text-3xl text-slate-950">Community edit suggestions</h2>
          <p className="mt-1 text-sm text-slate-600">
            From &quot;Suggest an edit&quot; on community pages. Make the change in the editor, then mark it applied.
            Group links pasted here go into the editor&apos;s Links boxes, which keep them private.
          </p>
        </div>
        <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-800">
          {suggestions.length} open
        </span>
      </div>

      <p className="mt-3 text-sm">
        <Link href="/admin/communities" className="text-(--color-pine) underline">
          All communities
        </Link>
      </p>

      {suggestions.length === 0 ? (
        <p className="mt-6 text-base text-slate-600">No open suggestions.</p>
      ) : (
        <ul className="mt-6 divide-y divide-(--color-sand-strong)">
          {suggestions.map((s) => (
            <li key={s.id} className="flex flex-col gap-4 py-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 space-y-2 text-sm lg:pr-6">
                <p className="text-base font-semibold text-slate-950">
                  {s.communityName}
                  {s.communityArchived ? <span className="ml-2 text-xs font-normal text-rose-700">archived</span> : null}
                  {s.communityStatus !== "published" ? (
                    <span className="ml-2 text-xs font-normal text-amber-700">{s.communityStatus}</span>
                  ) : null}
                </p>
                <p className="text-slate-600">
                  <span className="font-semibold">{suggestionTypeLabel(s.requestType)}</span>
                  {s.fields.length ? ` · ${s.fields.join(", ")}` : ""}
                </p>
                <p className="whitespace-pre-line break-words rounded-2xl bg-(--color-mist) p-3 text-slate-800">{s.newValue}</p>
                <p className="text-slate-500">
                  {age(s.createdAt)}
                  {s.contact ? ` · from ${s.contact}` : " · anonymous"}
                </p>
                <p className="flex gap-4">
                  <Link href={`/admin/communities/${s.communityId}/edit`} className="font-semibold text-(--color-pine) underline">
                    Open in editor
                  </Link>
                  {s.communitySlug && !s.communityArchived ? (
                    <a href={`/communities/${s.communitySlug}`} target="_blank" rel="noopener noreferrer" className="text-slate-500 underline">
                      Public page
                    </a>
                  ) : null}
                </p>
              </div>
              <ResolveSuggestionActions suggestionId={s.id} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
