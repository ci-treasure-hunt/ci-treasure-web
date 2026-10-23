import { CONTINENT_COUNTRIES } from "@/lib/continents";

// I-189 quick win: our Facebook groups, linked where people look at events (thank-you screen,
// approval email, country pages, region filter, type pages), not only in About and the FAQ.
// Names match the group titles on Facebook (em-dash included: it is the real title), so a reader
// recognizes the group there. The 4+ days rule is said in each lead sentence instead.
// Same rules as the groups themselves (I-138 Part D): regional groups take events of 2+ days in
// their region, the international group takes 4+ days anywhere.

export type FbRegion = "emea" | "americas" | "apac";

export type FbGroup = { name: string; url: string };

export const FB_REGIONAL_GROUPS: Record<FbRegion, FbGroup> = {
  emea: {
    name: "Contact Improvisation Events in Europe, Middle East & Africa (2+ days)",
    url: "https://www.facebook.com/groups/citreasurehuntemea",
  },
  americas: {
    name: "Contact Improvisation Events in the Americas (2+ days)",
    url: "https://www.facebook.com/groups/citreasurehuntamericas",
  },
  apac: {
    name: "Contact Improvisation Events in Asia, Australia & New Zealand (2+ days)",
    url: "https://www.facebook.com/groups/citreasurehuntapac",
  },
};

// For running text: "More CI events across {phrase}".
export const FB_REGION_PHRASE: Record<FbRegion, string> = {
  emea: "Europe, the Middle East & Africa",
  americas: "the Americas",
  apac: "Asia, Australia & New Zealand",
};

export const FB_INTERNATIONAL_GROUP: FbGroup = {
  name: "CI Treasure Hunt — Contact Improvisation Communities & Events Worldwide",
  url: "https://www.facebook.com/groups/citreasurehunt",
};

export function getFbRegion(country: string | null | undefined): FbRegion | null {
  if (!country) return null;
  const iso = country.toUpperCase();
  for (const region of ["emea", "americas", "apac"] as const) {
    if (CONTINENT_COUNTRIES[region].includes(iso)) return region;
  }
  return null;
}

// Calendar days, inclusive: a Saturday-Sunday weekend is 2.
export function eventLengthDays(startDate: string, endDate: string | null | undefined) {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate || startDate}T00:00:00Z`);
  return Math.round((end - start) / 86_400_000) + 1;
}

// The groups an organizer can post this event in: regional for 2+ days, international for 4+.
export function fbGroupsForEvent(event: { country: string | null; startDate: string; endDate: string | null }) {
  const days = eventLengthDays(event.startDate, event.endDate);
  const region = getFbRegion(event.country);
  const groups: FbGroup[] = [];
  if (days >= 2 && region) groups.push(FB_REGIONAL_GROUPS[region]);
  if (days >= 4) groups.push(FB_INTERNATIONAL_GROUP);
  return groups;
}
