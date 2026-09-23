import Link from "next/link";

import { requireAdminUser } from "@/lib/admin-auth";

import { getPendingCommunities } from "./actions";
import { CommunityReviewActions } from "./review-actions";

const PLATFORM_LABEL: Record<string, string> = {
  telegram: "Telegram group",
  whatsapp: "WhatsApp group",
  signal: "Signal group",
  line: "LINE group",
};

export default async function AdminPendingCommunitiesPage() {
  await requireAdminUser();
  const communities = await getPendingCommunities();

  return (
    <section className="rounded-[1.75rem] border border-white/80 bg-white/90 p-6 shadow-[0_18px_55px_rgba(106,75,25,0.08)]">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-serif text-3xl text-slate-950">Pending communities</h2>
          <p className="mt-1 text-sm text-slate-600">
            Submitted through the public Add form. Approving geocodes the location and publishes it. Private group invites
            stay unrevealable until you tick &quot;Revealable&quot; in the editor.
          </p>
        </div>
        <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-800">
          {communities.length} pending
        </span>
      </div>

      {communities.length === 0 ? (
        <p className="mt-6 text-base text-slate-600">No pending communities.</p>
      ) : (
        <ul className="mt-6 divide-y divide-(--color-sand-strong)">
          {communities.map((c) => (
            <li key={c.id} className="flex flex-col gap-4 py-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 space-y-2 text-sm lg:pr-6">
                <p className="text-base font-semibold text-slate-950">{c.name}</p>
                <p className="text-slate-600">
                  {[c.type, [c.city, c.country ?? "worldwide"].filter(Boolean).join(", "), c.activityLevel]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {c.focus.length || c.languages.length ? (
                  <p className="text-slate-500">
                    {[c.focus.join(", "), c.languages.join(", ")].filter(Boolean).join(" · ")}
                  </p>
                ) : null}
                {c.description ? <p className="whitespace-pre-line text-slate-700">{c.description}</p> : null}

                <ul className="space-y-1">
                  {c.links.map((l) => (
                    <li key={l.label} className="truncate">
                      <span className="text-slate-500">{l.label}: </span>
                      <a href={l.url} target="_blank" rel="noopener noreferrer nofollow" className="text-(--color-pine) underline">
                        {l.url}
                      </a>
                    </li>
                  ))}
                  {c.invitePlatforms.map((p) => (
                    <li key={p} className="text-slate-500">
                      🔒 {PLATFORM_LABEL[p] ?? p} invite (private, not revealable yet)
                    </li>
                  ))}
                  {c.hasEmail ? <li className="text-slate-500">✉ Community email given (see editor)</li> : null}
                </ul>

                <p className="text-slate-500">
                  Submitted {c.createdAt.slice(0, 10)}
                  {c.submitterContact ? ` by ${c.submitterContact}` : " anonymously"}
                </p>

                {c.possibleDuplicates.length > 0 ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                    <p className="font-semibold">Check for duplicates:</p>
                    <ul className="mt-1 space-y-0.5">
                      {c.possibleDuplicates.map((d) => (
                        <li key={d.id}>
                          <Link href={`/admin/communities/${d.id}/edit`} className="underline">
                            {d.name}
                          </Link>
                          {d.city ? ` (${d.city})` : ""}
                          {d.status !== "published" ? ` · ${d.status}` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
              <CommunityReviewActions communityId={c.id} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
