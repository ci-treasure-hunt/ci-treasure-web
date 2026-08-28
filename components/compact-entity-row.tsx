import Link from "next/link";
import { ExternalLink, MapPin } from "lucide-react";

import { getPrimaryJoinUrl, type Community } from "@/lib/communities";
import { getMediumUrl, toCdnUrl } from "@/lib/image-url";

// Table-style row: name / city / link as fixed grid columns, not a bordered card — a CSS grid
// rather than a real <table> so the columns can collapse per-row on narrow screens (name+link on
// one line, city dropping below) instead of forcing horizontal scroll the way a literal <table>
// would. Originally built for I-132's country pages, where it has to hold up from Sweden's
// 5-row lists to Germany's 39-row ones — reused wherever a list of communities or people needs a
// dense, scannable format rather than card tiles (I-153's community↔profile cross-links).
export function CompactCommunityRow({ community }: { community: Community }) {
  const joinUrl = getPrimaryJoinUrl(community);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_28px] items-center gap-3 px-4 py-2.5 sm:grid-cols-[minmax(0,1fr)_140px_28px]">
      <Link href={`/communities/${community.slug}`} className="truncate font-serif text-base text-slate-900 hover:underline">
        {community.name}
      </Link>
      {community.city && (
        <p className="col-start-1 row-start-2 flex items-center gap-1 text-xs text-slate-500 sm:col-start-2 sm:row-start-1 sm:text-sm">
          <MapPin className="size-3 shrink-0 text-slate-400" />
          {community.city}
        </p>
      )}
      {joinUrl && (
        <a
          href={joinUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="col-start-3 row-start-1 justify-self-end text-slate-400 hover:text-(--color-pine)"
          aria-label={`Visit ${community.name}`}
        >
          <ExternalLink className="size-4" />
        </a>
      )}
    </div>
  );
}

// I-150 ring: same dense row as CompactCommunityRow, minus the join-link icon — that icon means
// "here's how to contact this community", which doesn't apply to a same-type ring neighbor (an
// alphabetically-adjacent community, not a known relationship).
export function CompactCommunityRingRow({ community }: { community: { name: string; slug: string; city: string | null } }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 sm:grid-cols-[minmax(0,1fr)_140px]">
      <Link href={`/communities/${community.slug}`} className="truncate font-serif text-base text-slate-900 hover:underline">
        {community.name}
      </Link>
      {community.city && (
        <p className="col-start-1 row-start-2 flex items-center gap-1 text-xs text-slate-500 sm:col-start-2 sm:row-start-1 sm:text-sm">
          <MapPin className="size-3 shrink-0 text-slate-400" />
          {community.city}
        </p>
      )}
    </div>
  );
}

// One color per role so a scan down the list reads roles at a glance rather than everyone
// blurring into the same grey pill (I-074 follow-up, 2026-08-14). Kept as tinted/muted rather
// than saturated to stay in the site's soft palette, which otherwise only declares a single
// accent token (--color-pine) — see docs/web/design.md D-01.
const ROLE_STYLES: Record<string, string> = {
  teacher: "bg-blue-50 text-blue-700",
  organizer: "bg-amber-50 text-amber-800",
  musician: "bg-emerald-50 text-emerald-700",
};

export function CompactTeacherRow({ teacher }: { teacher: { name: string; slug: string; city: string | null; bio: string | null; imageUrl?: string | null; linkUrl?: string | null; roles?: string[]; isClaimed?: boolean } }) {
  const imageUrl = teacher.imageUrl?.trim() ?? "";
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_28px] items-center gap-3 px-4 py-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_140px_28px]">
      <div className="col-start-1 row-start-1 flex min-w-0 items-center gap-2">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={toCdnUrl(getMediumUrl(imageUrl))} alt={teacher.name} className="size-7 shrink-0 rounded-full object-cover" />
        ) : null}
        <Link href={`/teachers/${teacher.slug}`} className="truncate font-serif text-base text-slate-900 hover:underline">
          {teacher.name}
        </Link>
        {teacher.isClaimed && (
          // Claim incentive (2026-08-28): a quiet visual reward for the person who claimed their
          // profile, distinct from the role pills below (which describe what they do, not whether
          // they own the listing).
          <span
            className="shrink-0 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-medium tracking-wide text-violet-700 uppercase"
            title="This profile has been claimed by its owner"
          >
            Claimed
          </span>
        )}
        {teacher.roles?.map((role) => (
          // Every held role gets its own pill, teacher included: a silent default for the
          // majority case read ambiguous ("is this person just not tagged?") next to musician/
          // organizer always showing theirs.
          <span
            key={role}
            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase ${ROLE_STYLES[role] ?? "bg-slate-100 text-slate-500"}`}
          >
            {role}
          </span>
        ))}
      </div>
      {teacher.bio && (
        // Middle column, desktop only: fills the dead space a short name/location row otherwise
        // leaves at page width, and gives a reason to actually read a row instead of just its
        // name. Hidden below sm rather than wrapped to its own line — on a narrow screen this
        // list is already two lines per person, a bio snippet would make it three.
        <p className="col-start-2 row-start-1 hidden truncate text-xs text-slate-500 sm:block">
          {teacher.bio}
        </p>
      )}
      {teacher.city && (
        <p className="col-start-1 row-start-2 text-xs text-slate-500 sm:col-start-3 sm:row-start-1 sm:text-sm">
          {teacher.city}
        </p>
      )}
      {teacher.linkUrl && (
        <a
          href={teacher.linkUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="col-start-3 row-start-1 justify-self-end text-slate-400 hover:text-(--color-pine) sm:col-start-4"
          aria-label={`Visit ${teacher.name}'s website`}
        >
          <ExternalLink className="size-4" />
        </a>
      )}
    </div>
  );
}
