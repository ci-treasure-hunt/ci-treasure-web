// True geographic continents — deliberately separate from CONTINENT_COUNTRIES in lib/continents.ts,
// which is a 3-bucket *business* region split (Americas / EMEA / APAC) used for event/community
// filter UI, Facebook groups, and Telegram topics. That split is expected to get more granular over
// time as event volume grows in a given region — coupling this file to it would mean an operational
// regrouping (e.g. splitting EMEA for a new Facebook group) silently changes which entities show up
// as "also browse" neighbors on hundreds of pages. Kept as its own static lookup instead, matching
// the taxonomy `communities.continent` already uses (Airtable-sourced, confirmed via live data:
// Europe/Americas/Asia/Africa/Oceania, Middle East folded into Asia — e.g. IL/AE/TR are all "Asia"
// there, not a separate Middle East bucket). Used only as a widening fallback tier for the
// SEO "also browse" ring (I-150) when an entity's own country doesn't have enough siblings.
export type Continent = "Europe" | "Americas" | "Asia" | "Africa" | "Oceania";

const CONTINENT_COUNTRIES: Record<Continent, string[]> = {
  Americas: [
    "AG", "AR", "BB", "BO", "BR", "BS", "BZ", "CA", "CL", "CO", "CR", "CU", "DM", "DO", "EC", "GD",
    "GT", "GY", "HN", "HT", "JM", "KN", "LC", "MX", "NI", "PA", "PE", "PR", "PY", "SR", "SV", "TT",
    "US", "UY", "VC", "VE",
  ],
  Europe: [
    "AD", "AL", "AT", "BA", "BE", "BG", "BY", "CH", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR",
    "GB", "GR", "HR", "HU", "IE", "IS", "IT", "LI", "LT", "LU", "LV", "MC", "MD", "ME", "MK", "MT",
    "NL", "NO", "PL", "PT", "RO", "RS", "SE", "SI", "SK", "SM", "UA", "XK",
    // Russia: transcontinental, bucketed with Europe here (most common simple-geoscheme
    // convention) — no live communities.continent row to confirm this one either way.
    "RU",
  ],
  Asia: [
    // South Asia
    "AF", "BD", "BT", "IN", "LK", "MV", "NP", "PK",
    // Southeast Asia
    "BN", "ID", "KH", "LA", "MM", "MY", "PH", "SG", "TH", "TL", "VN",
    // East Asia
    "CN", "HK", "JP", "KP", "KR", "MN", "MO", "TW",
    // Central Asia
    "KG", "KZ", "TJ", "TM", "UZ",
    // Caucasus — standard UN geoscheme places these in Asia, not confirmed via live data
    "AM", "AZ", "GE",
    // Turkey — confirmed Asia via communities.continent
    "TR",
    // Middle East — confirmed Asia via communities.continent (IL, AE)
    "AE", "BH", "IQ", "IR", "IL", "JO", "KW", "LB", "OM", "PS", "QA", "SA", "SY", "YE",
  ],
  Africa: [
    "AO", "BF", "BI", "BJ", "BW", "CD", "CF", "CG", "CI", "CM", "CV", "DJ", "DZ", "EG", "ER", "ET",
    "GA", "GH", "GM", "GN", "GQ", "GW", "KE", "KM", "LR", "LS", "LY", "MA", "MG", "ML", "MR", "MU",
    "MW", "MZ", "NA", "NE", "NG", "RW", "SC", "SD", "SL", "SN", "SO", "SS", "ST", "SZ", "TD", "TG",
    "TN", "TZ", "UG", "ZA", "ZM", "ZW",
  ],
  Oceania: ["AU", "FJ", "NZ", "PG", "SB", "TO", "VU", "WS"],
};

const ISO_TO_CONTINENT = new Map<string, Continent>(
  Object.entries(CONTINENT_COUNTRIES).flatMap(([continent, countries]) =>
    countries.map((iso) => [iso, continent as Continent]),
  ),
);

export function getContinent(countryIso: string | null | undefined): Continent | null {
  if (!countryIso) return null;
  return ISO_TO_CONTINENT.get(countryIso.toUpperCase()) ?? null;
}

// I-150 ring: widen a country-scoped pool to every country sharing the same continent.
export function getContinentCountries(continent: Continent): string[] {
  return CONTINENT_COUNTRIES[continent];
}
