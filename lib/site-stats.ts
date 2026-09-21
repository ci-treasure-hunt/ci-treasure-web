import { createClient as createStaticClient } from "@/lib/supabase/static";
import { getVenueCountries } from "@/lib/venues";
import { getCommunityCountries } from "@/lib/communities";
import { getListedPeople } from "@/lib/teachers";

// I-156: the four database-derived figures /about quotes ("the site lists {publishedEvents}
// upcoming and past events across {eventCountries} countries..."). Kept out of lib/events.ts
// since this is the only caller and the query shape (status IN published/archived, no row data
// beyond country) doesn't match anything else there.
export type SiteStats = {
  publishedEvents: number;
  eventCountries: number;
  venueCount: number;
  profileCount: number;
  communityCount: number;
  communityCountries: number;
};

const EMPTY_STATS: SiteStats = {
  publishedEvents: 0,
  eventCountries: 0,
  venueCount: 0,
  profileCount: 0,
  communityCount: 0,
  communityCountries: 0,
};

function hasSupabaseEnv() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export async function getSiteStats(): Promise<SiteStats> {
  if (!hasSupabaseEnv()) return EMPTY_STATS;

  try {
    const supabase = createStaticClient();
    const [eventsResult, listedPeople, venueCountries, communityCountries] = await Promise.all([
      // "Past events stay online instead of being deleted" -- published (upcoming) and archived
      // (past) are both real, publicly-visible events; draft/rejected are not. Matches the
      // sitemap's hide=false filter, but deliberately includes archived where the sitemap
      // (an SEO decision, not a data-quality one) does not.
      supabase.from("events").select("country").in("status", ["published", "archived"]).eq("hide", false),
      // The same function /teachers lists from, so the count and the list can never disagree.
      //
      // This used to be its own count query filtered on show_in_list, under a comment claiming it
      // matched the /teachers admission rule. It stopped matching on 2026-09-19, when I-074 moved
      // that listing onto a derived rule (public, plus a credit on a published or archived event,
      // or a confirmed teacher flag) precisely because show_in_list is a stale one-off backfill
      // from 2026-07-10 that nothing maintains. The count kept reading the flag, so the site
      // advertised 546 people while the page beside it listed everyone who qualified: 259 public
      // teacher/organizer profiles have the flag off and were being left out of the headline.
      //
      // Costs more than a head-count query (three reads rather than one), which is accepted:
      // every caller is a statically generated page with a long revalidate, and duplicating the
      // admission rule here is exactly the bug being fixed.
      getListedPeople(),
      getVenueCountries(),
      getCommunityCountries(),
    ]);

    if (eventsResult.error) throw new Error(eventsResult.error.message);

    const eventCountrySet = new Set((eventsResult.data ?? []).map((row) => row.country).filter((c): c is string => !!c));

    return {
      publishedEvents: eventsResult.data?.length ?? 0,
      eventCountries: eventCountrySet.size,
      venueCount: venueCountries.count,
      profileCount: listedPeople.length,
      communityCount: communityCountries.count,
      communityCountries: communityCountries.countries.length,
    };
  } catch {
    return EMPTY_STATS;
  }
}
