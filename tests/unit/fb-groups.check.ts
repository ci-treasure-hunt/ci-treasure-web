/**
 * I-189: which Facebook groups an event is pointed to (thank-you screen, approval email).
 * Regional group for 2+ days in its region, international group for 4+ days anywhere.
 *
 * Run:  npx tsx tests/unit/fb-groups.check.ts        (exits non-zero on failure)
 *
 * Same shape as url-safety.check.ts, and run by the same "Unit checks" step in checks.yml.
 */
import { eventLengthDays, fbGroupsForEvent, getFbRegion } from "@/lib/fb-groups";

let failed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) console.log(`        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`);
}

const slugs = (country: string | null, startDate: string, endDate: string | null) =>
  fbGroupsForEvent({ country, startDate, endDate }).map((g) => g.url.split("/groups/")[1]);

console.log("--- eventLengthDays ---");
check("same day is 1", eventLengthDays("2026-11-07", "2026-11-07"), 1);
check("no end date is 1", eventLengthDays("2026-11-07", null), 1);
check("Sat-Sun weekend is 2", eventLengthDays("2026-11-07", "2026-11-08"), 2);
check("across month end", eventLengthDays("2026-10-30", "2026-11-02"), 4);
check("across DST change", eventLengthDays("2026-10-24", "2026-10-26"), 3);

console.log("--- getFbRegion ---");
check("DE is EMEA", getFbRegion("DE"), "emea");
check("lowercase works", getFbRegion("th"), "apac");
check("IL is EMEA (business regions, not continents)", getFbRegion("IL"), "emea");
check("MX is Americas", getFbRegion("MX"), "americas");
check("null country", getFbRegion(null), null);
check("unknown code", getFbRegion("ZZ"), null);

console.log("--- fbGroupsForEvent ---");
check("1-day event: no groups", slugs("DE", "2026-11-07", null), []);
check("weekend in Germany: EMEA only", slugs("DE", "2026-11-07", "2026-11-08"), ["citreasurehuntemea"]);
check("3 days in Thailand: APAC only", slugs("TH", "2026-12-01", "2026-12-03"), ["citreasurehuntapac"]);
check("4 days in Brazil: Americas + international", slugs("BR", "2026-12-01", "2026-12-04"), ["citreasurehuntamericas", "citreasurehunt"]);
check("4+ days, unknown country: international only", slugs(null, "2026-12-01", "2026-12-10"), ["citreasurehunt"]);

if (failed > 0) {
  console.log(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nall checks passed");
