import Link from "next/link";
import { type RingEntity } from "@/lib/entity-ring";

// I-150 "also browse" ring — deliberately minimal, a single unstyled line, not a design
// centerpiece. Renders nothing when the ring is empty (e.g. a lone entity with no siblings at
// any tier), which only happens for scopes with a single global entity — never observed today.
export function AlsoBrowse({ basePath, items }: { basePath: string; items: RingEntity[] }) {
  if (items.length === 0) return null;

  return (
    <p className="text-sm text-slate-400">
      Also browse:{" "}
      {items.map((item, i) => (
        <span key={item.slug}>
          <Link href={`${basePath}/${item.slug}`} className="text-(--color-pine) hover:underline">
            {item.name}
          </Link>
          {i < items.length - 1 ? ", " : ""}
        </span>
      ))}
    </p>
  );
}
