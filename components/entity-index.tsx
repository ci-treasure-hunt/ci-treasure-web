import Link from "next/link";

// I-150: the interactive grid on /communities, /venues, and the homepage's event dashboard all
// call useSearchParams(), which forces them into a <Suspense> boundary — Next only statically
// prerenders the empty fallback, so crawlers that don't execute client JS see zero real <a href>
// links to any entity (same root cause as the earlier H1 bug, fixed the same way: pull a plain
// server-rendered block out of the Suspense boundary). /teachers had no entity list at all.
//
// Collapsed by default via <details> — the interactive grid above is the real UI for everyone
// with JS; this is a backstop, not a second UI, so it stays out of the way visually. Real users
// occasionally expanding it works fine (native <details>, no JS needed); crawlers see every link
// in server HTML regardless of the collapsed state, same as any FAQ accordion.
type IndexItem = { slug: string; name: string; country?: string | null };

export function EntityIndex({
  basePath,
  items,
  label,
}: {
  basePath: string;
  items: IndexItem[];
  label: string;
}) {
  if (items.length === 0) return null;

  const groups = new Map<string, IndexItem[]>();
  for (const item of items) {
    const key = item.country || "Other";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }
  const sortedGroups = Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <details className="mt-10 rounded-2xl border border-(--color-sand-strong) bg-white/60 p-5 text-sm text-slate-600">
      <summary className="cursor-pointer font-semibold text-slate-700">
        Browse all {label} ({items.length})
      </summary>
      <div className="mt-4 space-y-4">
        {sortedGroups.map(([country, group]) => (
          <div key={country}>
            <p className="mb-1 text-xs font-bold uppercase tracking-widest text-slate-400">{country}</p>
            <p className="leading-6">
              {[...group]
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((item, i) => (
                  <span key={item.slug}>
                    <Link href={`${basePath}/${item.slug}`} className="text-(--color-pine) hover:underline">
                      {item.name}
                    </Link>
                    {i < group.length - 1 ? ", " : ""}
                  </span>
                ))}
            </p>
          </div>
        ))}
      </div>
    </details>
  );
}
