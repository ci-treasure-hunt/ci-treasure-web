import Link from "next/link";

import { requireAdminUser } from "@/lib/admin-auth";
import { getMediumUrl } from "@/lib/image-url";

import { getPendingCommunityPhotos } from "./actions";
import { CommunityPhotoReviewActions } from "./review-actions";

export default async function AdminCommunityPhotosPage() {
  await requireAdminUser();
  const photos = await getPendingCommunityPhotos();

  return (
    <section className="rounded-[1.75rem] border border-white/80 bg-white/90 p-6 shadow-[0_18px_55px_rgba(106,75,25,0.08)]">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-serif text-3xl text-slate-950">Community photos</h2>
          <p className="mt-1 text-sm text-slate-600">
            Uploaded by visitors. Approve a jam, class or group photo that shows the practice. Not a single
            person&apos;s portrait, no flyers, nobody identifiable in a private-looking moment. No photo is better
            than the wrong one.
          </p>
        </div>
        <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-800">
          {photos.length} pending
        </span>
      </div>

      <p className="mt-3 text-sm">
        <Link href="/admin/communities" className="text-(--color-pine) underline">
          All communities
        </Link>
      </p>

      {photos.length === 0 ? (
        <p className="mt-6 text-base text-slate-600">No pending photos.</p>
      ) : (
        <ul className="mt-6 divide-y divide-(--color-sand-strong)">
          {photos.map((p) => (
            <li key={p.id} className="flex flex-col gap-4 py-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 space-y-3 text-sm lg:pr-6">
                <p className="text-base font-semibold text-slate-950">
                  {p.communityName}
                  {p.communityStatus !== "published" ? (
                    <span className="ml-2 text-xs font-normal text-amber-700">
                      {p.communityStatus === "pending" ? "community pending review too" : p.communityStatus}
                    </span>
                  ) : null}
                </p>
                <div className="flex flex-wrap gap-4">
                  <figure className="space-y-1">
                    <a href={p.imageUrl} target="_blank" rel="noopener noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={getMediumUrl(p.imageUrl)}
                        alt={`New photo for ${p.communityName}`}
                        className="h-48 w-auto max-w-full rounded-2xl border border-(--color-sand-strong) object-cover"
                      />
                    </a>
                    <figcaption className="text-xs text-slate-500">New (click for full size)</figcaption>
                  </figure>
                  {p.currentImageUrl ? (
                    <figure className="space-y-1">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={getMediumUrl(p.currentImageUrl)}
                        alt={`Current photo for ${p.communityName}`}
                        className="h-48 w-auto max-w-full rounded-2xl border border-(--color-sand-strong) object-cover opacity-80"
                      />
                      <figcaption className="text-xs text-slate-500">Current, replaced on approve</figcaption>
                    </figure>
                  ) : null}
                </div>
                <p className="text-slate-600">{p.imageCredit ?? "No credit given"}</p>
                <p className="text-slate-500">
                  Uploaded {p.createdAt.slice(0, 10)}
                  {p.contact ? ` by ${p.contact}` : " anonymously"}
                </p>
                <p className="flex gap-4">
                  <Link href={`/admin/communities/${p.communityId}/edit`} className="text-(--color-pine) underline">
                    Open in editor
                  </Link>
                  {p.communitySlug && p.communityStatus === "published" ? (
                    <a href={`/communities/${p.communitySlug}`} target="_blank" rel="noopener noreferrer" className="text-slate-500 underline">
                      Public page
                    </a>
                  ) : null}
                </p>
              </div>
              <CommunityPhotoReviewActions submissionId={p.id} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
