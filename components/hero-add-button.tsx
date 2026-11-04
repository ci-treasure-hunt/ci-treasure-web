import Link from "next/link";
import { Plus } from "lucide-react";

// I-192 stage 1 (2026-11-04): the "add" call to action in the hero of the four list pages
// (/, /communities, /venues, /teachers). Same filled pine pill as the header's "Add an event",
// so adding things reads as one consistent action across the site.
export function HeroAddButton({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded-full bg-(--color-pine) px-5 py-2.5 text-sm font-semibold whitespace-nowrap text-white transition hover:opacity-90"
    >
      <Plus className="size-4" aria-hidden="true" />
      {label}
    </Link>
  );
}
