/**
 * I-184: behavioural checks for the save-time rules in lib/event-features.ts, which keep
 * events.features and events.accommodation_type inside the fixed vocabulary.
 *
 * Run:  npx tsx tests/unit/event-features.check.ts        (exits non-zero on failure)
 *
 * Same shape as url-safety.check.ts, and run by the same "Unit checks" step in checks.yml.
 */
import { EVENT_FEATURES, sanitizeAccommodation, sanitizeFeatures } from "@/lib/event-features";
import { buildPrice } from "@/lib/organizer-events";

let failed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) console.log(`        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`);
}

console.log("--- vocabulary ---");
const slugs = EVENT_FEATURES.map((f) => f.slug);
check("no duplicate slugs", slugs.length, new Set(slugs).size);
check("no em-dash in labels or hints", EVENT_FEATURES.some((f) => /—/.test(f.label + (f.hint ?? ""))), false);

console.log("--- sanitizeFeatures ---");
check("drops unknown values (Jo's 3M9J case)", sanitizeFeatures(["The Axis Syllabus", "Jams", "CI", "community"], "workshop"), null);
check("keeps known values in list order", sanitizeFeatures(["live_music", "residential", "nature"], "festival"), [
  "residential",
  "nature",
  "live_music",
]);
check("dedupes", sanitizeFeatures(["sauna", "sauna"], "retreat"), ["sauna"]);
check("drops jams on a jam", sanitizeFeatures(["jams", "live_music"], "jam"), ["live_music"]);
check("drops jams on a long jam", sanitizeFeatures(["jams"], "long_jam"), null);
check("keeps jams on a festival", sanitizeFeatures(["jams"], "festival"), ["jams"]);
check("null in, null out", sanitizeFeatures(null, "workshop"), null);
check("empty in, null out", sanitizeFeatures([], "workshop"), null);

console.log("--- sanitizeAccommodation ---");
check("cleared when not residential", sanitizeAccommodation(["camping"], ["nature"]), null);
check("cleared when no features", sanitizeAccommodation(["camping"], null), null);
check("kept when residential, list order", sanitizeAccommodation(["private_room", "camping"], ["residential"]), [
  "camping",
  "private_room",
]);
check("drops unknown room types", sanitizeAccommodation(["dorm", "commuter", "yurt"], ["residential"]), ["yurt"]);
check("residential with no room types", sanitizeAccommodation([], ["residential"]), null);

// Same release (2026-10-23): every form save used to drop price.notes. buildPrice keeps it.
console.log("--- buildPrice ---");
const item = { amount: 15000, currency: "EUR", description: "Regular" };
check("items + notes kept", buildPrice([item], " Meals included "), { items: [item], notes: "Meals included" });
check("notes only", buildPrice([], "By donation"), { notes: "By donation" });
check("items only", buildPrice([item], ""), { items: [item] });
check("nothing → null", buildPrice([], "  "), null);
check("undefined notes", buildPrice([item], undefined), { items: [item] });

console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAILURE(S)`);
process.exit(failed === 0 ? 0 : 1);
