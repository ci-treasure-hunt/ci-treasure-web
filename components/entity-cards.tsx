import Link from "next/link";
import { MapPin } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { GENERIC_ACCENT_GRADIENT } from "@/lib/event-display";
import { getMediumUrl, toCdnUrl } from "@/lib/image-url";

// Built for I-132's country pages (Venues section), reused wherever a venue connection deserves
// real presence rather than a bare link — I-153's community/profile cross-links included, since
// venues reliably have real photography in a way communities and profiles mostly don't yet.
export function VenueCard({ venue, roleLabel }: {
  venue: { name: string; slug: string; city: string | null; description: string | null; imageUrl: string | null };
  roleLabel?: string | null;
}) {
  const imageUrl = venue.imageUrl?.trim() ?? "";
  const renderImage = imageUrl.length > 0;

  // Anchor-text/a11y fix (I-132 follow-up): description stays outside the <Link> — only the
  // name/image are the link, so a screen reader doesn't announce the whole card as one link.
  return (
    <div className="flex overflow-hidden rounded-2xl border border-(--color-sand-strong) bg-white shadow-sm transition hover:shadow-lg">
      <Link href={`/venues/${venue.slug}`} className={`h-24 w-24 shrink-0 border-r border-(--color-sand-strong) ${!renderImage ? GENERIC_ACCENT_GRADIENT : ""}`}>
        {renderImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={toCdnUrl(getMediumUrl(imageUrl))} alt={venue.name} className="h-full w-full object-cover" />
        )}
      </Link>
      <div className="min-w-0 flex-1 p-4">
        <h3 className="font-serif text-lg text-slate-900">
          <Link href={`/venues/${venue.slug}`} className="hover:underline">{venue.name}</Link>
          {roleLabel && <span className="ml-2 text-sm font-sans font-normal text-slate-400">· {roleLabel}</span>}
        </h3>
        {venue.city && <p className="text-sm text-slate-500">{venue.city}</p>}
        {venue.description && <p className="mt-1 line-clamp-2 text-sm text-slate-600">{venue.description}</p>}
      </div>
    </div>
  );
}

// Low-cardinality treatment (a profile is rarely part of more than 1-2 communities) — same
// "give it real presence, not a line in a list" reasoning as the country pages' national-community
// spotlight, generalized for reuse. Communities have no photos yet, so the accent border + type
// badge carry the visual weight instead of an image.
export function CommunitySpotlightCard({ community }: {
  community: { name: string; slug: string; type: string | null; city: string | null; description: string | null };
}) {
  return (
    <div className="rounded-xl border border-(--color-sand-strong) border-l-4 border-l-(--color-pine) bg-(--color-sand) p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/communities/${community.slug}`} className="font-serif text-xl text-slate-900 hover:underline">
          {community.name}
        </Link>
        {community.type && (
          <Badge variant="secondary" className="bg-slate-100 text-xs text-slate-600">
            {community.type}
          </Badge>
        )}
      </div>
      {community.city && (
        <p className="mt-1 flex items-center gap-1 text-sm text-slate-500">
          <MapPin className="size-3.5 shrink-0 text-slate-400" />
          {community.city}
        </p>
      )}
      {community.description && <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-700">{community.description}</p>}
    </div>
  );
}
