import Link from "next/link";
import { BadgeCheck, ExternalLink, MapPin } from "lucide-react";

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

function RolePills({ roles }: { roles: string[] }) {
  return (
    <>
      {roles.map((role) => (
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
    </>
  );
}

// Mobile layout fix (2026-10-03): with the claimed pill plus 2-3 role pills on the name line, a
// phone-width row left the name (the only shrinkable item) a few pixels, so names truncated to
// their first letter. Below sm the role pills now move to line 2 next to the city, and "claimed"
// is a check icon after the name on every screen size instead of a pill.
export function CompactTeacherRow({ teacher }: { teacher: { name: string; slug: string; city: string | null; bio: string | null; imageUrl?: string | null; linkUrl?: string | null; roles?: string[]; isClaimed?: boolean } }) {
  const imageUrl = teacher.imageUrl?.trim() ?? "";
  const roles = teacher.roles ?? [];
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_28px] items-center gap-x-3 gap-y-1.5 px-4 py-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_140px_28px] sm:gap-y-3">
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
          // profile, distinct from the role pills (which describe what they do, not whether they
          // own the listing). Same BadgeCheck icon as the "Claimed profiles ... are shown first"
          // caption on /teachers, so the two read as one signal.
          <span className="shrink-0 text-violet-600" title="This profile has been claimed by its owner">
            <BadgeCheck className="size-4" aria-hidden="true" />
            <span className="sr-only">Claimed profile</span>
          </span>
        )}
        {roles.length > 0 && (
          <span className="hidden shrink-0 items-center gap-2 sm:flex">
            <RolePills roles={roles} />
          </span>
        )}
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
      {(teacher.city || roles.length > 0) && (
        // Line 2 on mobile: city plus the role pills, so the name line keeps (nearly) full width.
        <div className="col-start-1 row-start-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 sm:hidden">
          {teacher.city && <p className="text-xs text-slate-500">{teacher.city}</p>}
          <RolePills roles={roles} />
        </div>
      )}
      {teacher.city && (
        <p className="hidden text-sm text-slate-500 sm:col-start-3 sm:row-start-1 sm:block">
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
