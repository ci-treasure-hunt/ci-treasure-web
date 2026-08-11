// I-150 "also browse" ring — a same-type circular next/previous linker added to every
// teacher/community/venue detail page, so pages with no other inbound link (self-submitted
// profiles with no event credit, venues with no events yet) still get a real internal link
// pointing at them from somewhere Ahrefs actually crawls. See i-150-seo-ahrefs-audit.md for
// the full design discussion and why a ring (not a bare index) was chosen.
export const RING_WIDTH = 2;

// A country/continent pool needs at least this many entities to guarantee RING_WIDTH distinct
// neighbors on each side — below this, buildRing() would just wrap back over entities already
// picked. Also the mechanism that keeps a ring from forming a fully disconnected island: if every
// teacher in a country is itself orphaned (Czechia, Lithuania — real cases, not hypothetical),
// a same-country-only ring interlinks them perfectly but leaves them invisible to a crawler with
// no way in. Widening to a bigger pool (continent, then global) makes it far more likely the ring
// includes at least one already-bridged entity, which becomes the real way in.
export const RING_MIN_POOL = RING_WIDTH * 2 + 1;

export type RingEntity = { slug: string; name: string };

// Pure — sorts the pool by slug (stable, per I-117) and returns up to RING_WIDTH entities before
// and after the current one, wrapping around at the ends. Self-healing on add/remove: no
// first/last special-casing, no stored state.
export function buildRing<T extends RingEntity>(
  pool: T[],
  currentSlug: string,
  width = RING_WIDTH,
): T[] {
  const sorted = [...pool].sort((a, b) => a.slug.localeCompare(b.slug));
  const idx = sorted.findIndex((e) => e.slug === currentSlug);
  if (idx === -1 || sorted.length <= 1) return [];

  const seen = new Set([currentSlug]);
  const before: T[] = [];
  const after: T[] = [];

  for (let step = 1; step <= width; step++) {
    const beforeEntity = sorted[(idx - step + sorted.length) % sorted.length];
    const afterEntity = sorted[(idx + step) % sorted.length];
    if (!seen.has(beforeEntity.slug)) {
      before.unshift(beforeEntity);
      seen.add(beforeEntity.slug);
    }
    if (!seen.has(afterEntity.slug)) {
      after.push(afterEntity);
      seen.add(afterEntity.slug);
    }
  }

  return [...before, ...after];
}
