/**
 * I-181: checks for the venue name matching that decides whether an event's place links to an
 * existing venue or becomes a new one, and for the Pin/Page/Listed level mapping.
 *
 * Run:  npx tsx tests/unit/venue-records.check.ts        (exits non-zero on failure)
 */
import { venueLevel, venueLevelColumns } from "@/lib/admin-venues";
import { namesMatch } from "@/lib/venue-records";

let failed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) console.log(`        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`);
}

console.log("--- namesMatch: same place ---");
check("identical", namesMatch("Villa Wigman", "Villa Wigman"), true);
check("city appended", namesMatch("Villa Wigman", "Villa Wigman Dresden"), true);
check("case and accents", namesMatch("Kämpenhof", "KAEMPENHOF".replace("AE", "Ä")), true);
check("filler word dropped", namesMatch("Studio Rybalov", "Rybalov"), true);
check("punctuation", namesMatch("Esat Hâl", "Esat Hal"), true);

console.log("--- namesMatch: different places ---");
check("numbered studios", namesMatch("Uferstudio 14", "Uferstudio 5"), false);
check("short fragment", namesMatch("Tanz", "Tanzfabrik"), false);
check("unrelated", namesMatch("Dansekapellet", "Triade"), false);
check("empty", namesMatch("", "Triade"), false);
check("only filler words", namesMatch("Studio", "The Studio"), false);

console.log("--- levels ---");
check("hidden is pin", venueLevel("hidden", false), "pin");
check("hidden + listed flag still pin", venueLevel("hidden", true), "pin");
check("public is page", venueLevel("public", false), "page");
check("public + list is listed", venueLevel("public", true), "listed");
check("pin columns", venueLevelColumns("pin"), { visibility: "hidden", showInList: false });
check("listed columns", venueLevelColumns("listed"), { visibility: "public", showInList: true });

console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAILURE(S)`);
process.exit(failed === 0 ? 0 : 1);
