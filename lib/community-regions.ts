// I-111: region + continent for communities, derived from the country.
//
// Airtable used to fill `communities.region` and `communities.continent` through a lookup on its
// Countries table. Once communities are Supabase-authoritative that lookup is gone, so this map
// replaces it. Generated 2026-09-23 from the live data (every live community's country → region
// pair, 69 countries, no country had two regions), so existing rows and new ones agree.
//
// The region taxonomy is the project's own (sub-continent groupings used on the community pages),
// not a standard one; add a country here when a community from a new country is approved. Until
// then deriveCommunityLocation() leaves region NULL and falls back to getContinent() for the
// continent, and the admin form lets the region be picked by hand.

import { getContinent } from "@/lib/entity-continents";

export const WORLDWIDE = "Worldwide / International";

export const COMMUNITY_REGIONS = [
  "Western Europe",
  "Southern Europe",
  "Central & Eastern Europe",
  "Nordics & Baltics",
  "Balkans",
  "Russia & Belarus",
  "North America",
  "Central America & Caribbean",
  "South America",
  "East Asia",
  "Southeast Asia",
  "South Asia",
  "Central Asia",
  "West Asia & Caucasus",
  "Africa",
  "Oceania",
] as const;

const REGION_CONTINENT: Record<(typeof COMMUNITY_REGIONS)[number], string> = {
  "Western Europe": "Europe",
  "Southern Europe": "Europe",
  "Central & Eastern Europe": "Europe",
  "Nordics & Baltics": "Europe",
  Balkans: "Europe",
  "Russia & Belarus": "Europe",
  "North America": "Americas",
  "Central America & Caribbean": "Americas",
  "South America": "Americas",
  "East Asia": "Asia",
  "Southeast Asia": "Asia",
  "South Asia": "Asia",
  "Central Asia": "Asia",
  "West Asia & Caucasus": "Asia",
  Africa: "Africa",
  Oceania: "Oceania",
};

const COUNTRY_REGION: Record<string, (typeof COMMUNITY_REGIONS)[number]> = {
  AE: "West Asia & Caucasus", AM: "West Asia & Caucasus", AR: "South America",
  AT: "Central & Eastern Europe", AU: "Oceania", BE: "Western Europe", BG: "Balkans",
  BR: "South America", CA: "North America", CH: "Central & Eastern Europe", CL: "South America",
  CN: "East Asia", CO: "South America", CR: "Central America & Caribbean",
  CZ: "Central & Eastern Europe", DE: "Central & Eastern Europe", DK: "Nordics & Baltics",
  EC: "South America", EE: "Nordics & Baltics", EG: "Africa", ES: "Southern Europe",
  FI: "Nordics & Baltics", FR: "Western Europe", GB: "Western Europe", GE: "West Asia & Caucasus",
  GR: "Southern Europe", GT: "Central America & Caribbean", HK: "East Asia", HR: "Balkans",
  HU: "Central & Eastern Europe", ID: "Southeast Asia", IE: "Western Europe",
  IL: "West Asia & Caucasus", IN: "South Asia", IS: "Nordics & Baltics", IT: "Southern Europe",
  JP: "East Asia", KR: "East Asia", KZ: "Central Asia", LT: "Nordics & Baltics",
  LU: "Western Europe", LV: "Nordics & Baltics", MD: "Central & Eastern Europe",
  MT: "Southern Europe", MX: "Central America & Caribbean", MY: "Southeast Asia",
  NL: "Western Europe", NO: "Nordics & Baltics", NP: "South Asia", NZ: "Oceania",
  PE: "South America", PL: "Central & Eastern Europe", PT: "Southern Europe", RO: "Balkans",
  RS: "Balkans", RU: "Russia & Belarus", SE: "Nordics & Baltics", SG: "Southeast Asia",
  SI: "Balkans", SK: "Central & Eastern Europe", TH: "Southeast Asia", TR: "West Asia & Caucasus",
  TW: "East Asia", UA: "Central & Eastern Europe", US: "North America", UY: "South America",
  VN: "Southeast Asia", ZA: "Africa",
};

export function isCommunityRegion(value: string): value is (typeof COMMUNITY_REGIONS)[number] {
  return (COMMUNITY_REGIONS as readonly string[]).includes(value);
}

/**
 * Region + continent for a community. `country` NULL means worldwide / several countries.
 * An explicit `regionOverride` (the admin picked one) wins over the map.
 */
export function deriveCommunityLocation(
  country: string | null,
  regionOverride?: string | null,
): { region: string | null; continent: string | null } {
  if (!country) return { region: WORLDWIDE, continent: WORLDWIDE };
  const override = regionOverride && isCommunityRegion(regionOverride) ? regionOverride : null;
  const region = override ?? COUNTRY_REGION[country.toUpperCase()] ?? null;
  const continent = region ? REGION_CONTINENT[region] : getContinent(country);
  return { region, continent: continent ?? null };
}
