import { toCdnUrl } from "@/lib/image-url";

type EntityImageProps = {
  src: string;
  alt: string;
  credit?: string | null;
};

// Shared image + credit block for entity detail pages (venues, teachers).
// Full width, natural aspect ratio (no forced crop) - matches venue's original
// treatment - plus a max-height cap so an unusually tall/narrow source photo
// can't stretch the column indefinitely (venue's own prior implementation
// didn't have this cap; added here for both entity types, see I-122/design.md).
export function EntityImage({ src, alt, credit }: EntityImageProps) {
  return (
    <div>
      <div className="overflow-hidden rounded-2xl border border-(--color-sand-strong)">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={toCdnUrl(src)} alt={alt} className="h-auto max-h-128 w-full object-cover" />
      </div>
      {credit ? (
        <p className="mt-2 inline-block rounded-full bg-white/80 px-2.5 py-0.5 text-xs text-slate-700 backdrop-blur-sm">
          {credit}
        </p>
      ) : null}
    </div>
  );
}
