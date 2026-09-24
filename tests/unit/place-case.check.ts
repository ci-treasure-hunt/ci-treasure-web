/**
 * I-111: checks for normalizePlaceCase (lib/place-case.ts), which fixes the casing of a city typed
 * into the public Add form.
 *
 * Run:  npx tsx tests/unit/place-case.check.ts        (exits non-zero on failure)
 */
import { normalizePlaceCase } from "@/lib/place-case";

let failed = 0;
function check(input: string, expected: string) {
  const actual = normalizePlaceCase(input);
  const ok = actual === expected;
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${JSON.stringify(input)} -> ${JSON.stringify(actual)}`);
  if (!ok) console.log(`        want=${JSON.stringify(expected)}`);
}

console.log("--- single-case input is fixed ---");
check("milan", "Milan");
check("MILAN", "Milan");
check("  milan  ", "Milan");
check("rio de janeiro", "Rio de Janeiro");
check("frankfurt am main", "Frankfurt am Main");
check("são paulo", "São Paulo");
check("zürich", "Zürich");
check("ille-sur-têt", "Ille-sur-Têt");
check("st. petersburg", "St. Petersburg");
check("byron bay / mullumbimby", "Byron Bay / Mullumbimby");
check("de haag", "De Haag");
check("la paz", "La Paz");
check("latin america", "Latin America");
check("worldwide", "Worldwide");

console.log("--- mixed case is left alone ---");
check("Milan", "Milan");
check("Kansai (Kyoto, Osaka)", "Kansai (Kyoto, Osaka)");
check("Ille-sur-Têt", "Ille-sur-Têt");
check("McAllen", "McAllen");
check("Den Haag", "Den Haag");
check("Byron Bay / Mullumbimby", "Byron Bay / Mullumbimby");

console.log("--- non-letters ---");
check("", "");
check("1010", "1010");
check("東京", "東京");

if (failed > 0) {
  console.log(`\n${failed} FAILED`);
  process.exit(1);
}
console.log("\nALL PASS");
