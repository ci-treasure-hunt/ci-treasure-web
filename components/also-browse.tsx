// I-150 "also browse" ring — a tier-aware heading ("More teachers in Germany" / "in Europe" /
// "worldwide") plus whatever row/tile markup the caller renders inside (CompactTeacherRow,
// VenueCard, CompactCommunityRingRow — same components already used for real associations
// elsewhere on these pages, so the ring visually matches rather than introducing a 4th style).
export function RingSection({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="font-serif text-2xl text-slate-950">{heading}</h2>
      {children}
    </section>
  );
}
