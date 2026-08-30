import { createClient as createStaticClient } from "@/lib/supabase/static";
import { getVenueCountries } from "@/lib/venues";
import { getCommunityCountries } from "@/lib/communities";

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
    const [eventsResult, profilesResult, venueCountries, communityCountries] = await Promise.all([
      // "Past events stay online instead of being deleted" -- published (upcoming) and archived
      // (past) are both real, publicly-visible events; draft/rejected are not. Matches the
      // sitemap's hide=false filter, but deliberately includes archived where the sitemap
      // (an SEO decision, not a data-quality one) does not.
      supabase.from("events").select("country").in("status", ["published", "archived"]).eq("hide", false),
      // Same admission rule as the /teachers listing (I-074): teacher OR organizer, public, listed.
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .or("is_teacher.eq.true,is_organizer.eq.true")
        .eq("visibility", "public")
        .eq("show_in_list", true),
      getVenueCountries(),
      getCommunityCountries(),
    ]);

    if (eventsResult.error) throw new Error(eventsResult.error.message);
    if (profilesResult.error) throw new Error(profilesResult.error.message);

    const eventCountrySet = new Set((eventsResult.data ?? []).map((row) => row.country).filter((c): c is string => !!c));

    return {
      publishedEvents: eventsResult.data?.length ?? 0,
      eventCountries: eventCountrySet.size,
      venueCount: venueCountries.count,
      profileCount: profilesResult.count ?? 0,
      communityCount: communityCountries.count,
      communityCountries: communityCountries.countries.length,
    };
  } catch {
    return EMPTY_STATS;
  }
}
