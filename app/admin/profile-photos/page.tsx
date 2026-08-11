import { requireAdminUser } from "@/lib/admin-auth";

import { getPendingProfilePhotos } from "./actions";
import { PhotoReviewActions } from "./review-actions";

export default async function AdminProfilePhotosPage() {
  await requireAdminUser();
  const photos = await getPendingProfilePhotos();

  return (
    <section className="rounded-[1.75rem] border border-white/80 bg-white/90 p-6 shadow-[0_18px_55px_rgba(106,75,25,0.08)]">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-serif text-3xl text-slate-950">Pending profile photos</h2>
          <p className="mt-1 text-sm text-slate-600">
            Self-uploaded teacher photos awaiting review before they go public.
          </p>
        </div>
        <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-800">
          {photos.length} pending
        </span>
      </div>

      {photos.length === 0 ? (
        <p className="mt-6 text-base text-slate-600">No pending photos.</p>
      ) : (
        <ul className="mt-6 divide-y divide-(--color-sand-strong)">
          {photos.map((photo) => (
            <li key={photo.id} className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <a href={photo.imageUrl} target="_blank" rel="noopener noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.imageUrl}
                    alt={photo.name}
                    className="h-20 w-20 rounded-2xl border border-(--color-sand-strong) object-cover transition hover:opacity-80"
                  />
                </a>
                <div>
                  <p className="font-semibold text-slate-950">{photo.name}</p>
                  {photo.imageCredit && (
                    <p className="mt-1 text-sm text-slate-500">Credit: {photo.imageCredit}</p>
                  )}
                </div>
              </div>
              <PhotoReviewActions profileId={photo.id} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
