// Pure date helpers for series occurrences (I-171), shared by the admin generator (lib/series.ts,
// server-only) and the organizer form (client). Nothing here may touch Supabase or the network.

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string) {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);
}

// Accepts one date per line, or separated by commas/spaces. ISO (2026-11-07) or day-first
// (07.11.2026, 7/11/2026), since that's how dates arrive from European organizer pages.
export function parseDateList(input: string): { dates: string[]; invalid: string[] } {
  const dates = new Set<string>();
  const invalid: string[] = [];
  for (const raw of input.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean)) {
    let iso: string | null = null;
    if (ISO_DATE.test(raw)) {
      iso = raw;
    } else {
      const m = raw.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
      if (m) iso = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    }
    // Round-trip check rejects 2026-02-30 and friends.
    if (iso && !Number.isNaN(Date.parse(`${iso}T00:00:00Z`)) && new Date(`${iso}T00:00:00Z`).toISOString().slice(0, 10) === iso) {
      dates.add(iso);
    } else {
      invalid.push(raw);
    }
  }
  return { dates: [...dates].sort(), invalid };
}
