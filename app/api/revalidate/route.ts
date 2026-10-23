import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";

import { CACHE_TAGS } from "@/lib/cache-tags";

import { buildEventSlug, slugify } from "@/lib/events";
import { getCountryLabel } from "@/lib/event-display";
import { EVENT_TYPE_PAGES } from "@/lib/event-type-pages";
import { createAdminClient } from "@/lib/supabase/admin";

// Called by a Supabase Database Webhook (pg_net trigger, see
// supabase/migrations/*_revalidate_on_write.sql and *_i175_link_table_revalidate.sql) whenever a
// row changes in events, profiles, venues, communities, country_summaries, the link tables between
// them, or the profile/venue invite tables. Closes the ISR staleness gap for writes that happen
// outside the app (direct SQL/MCP, enrichment scripts), which never go through the server actions
// that call revalidatePath for in-app edits.
//
// I-175: each write refreshes exactly the pages that show the changed row (looked up here, "gap 2"
// in the spec), never a whole dynamic route: once the detail pages are cached, a path-pattern
// call would re-render every page of that type on any single edit. Lookups use the admin client
// so a page is found whatever its visibility; refreshing a path that has no public page is a no-op.

const REVALIDATE_SECRET = process.env.REVALIDATE_SECRET;

type Row = Record<string, unknown>;

type WebhookPayload = {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  record: Row | null;
  old_record: Row | null;
};

// I-175: the whole-list data snapshots (lib/cache-tags.ts) are invalidated per type: an event write
// reloads the events list, not all four. `expire: 0` makes the next read block on a fresh load
// instead of serving the old list once more ("max" would hand the first reader after an edit stale
// data, and on a quiet list that first reader can be days later). Lazy either way: many writes
// between two reads cost one reload. Pages that read a snapshot (lists, country pages) inherit its
// tag, so this also refreshes them; the revalidatePath calls below stay for the pages that don't.
function invalidateSnapshot(tag: string) {
  revalidateTag(tag, { expire: 0 });
}

// I-172: a write to any of these tables changes what a country page lists, but nothing here used
// to invalidate /[country] on those writes — the page depended entirely on its own timer. That is
// why the timer had to stay at an hour, and why every crawler sweep of the country pages
// regenerated them. With this, the timer becomes a backstop and can go to 24h like the rest.
// Slug derivation matches the country_summaries case below and getAllCountrySummaries().
function revalidateCountryFor(...records: (Row | null)[]) {
  const seen = new Set<string>();
  for (const rec of records) {
    const iso = rec?.country;
    if (typeof iso !== "string" || !iso) continue;
    const slug = slugify(getCountryLabel(iso));
    if (slug && !seen.has(slug)) {
      seen.add(slug);
      revalidatePath(`/${slug}`);
    }
  }
  // The index counts events per country, so it moves with the same writes.
  if (seen.size > 0) revalidatePath("/countries");
}

// Distinct non-empty string values of `key` across the given rows (new and old side of a write).
function valuesOf(key: string, ...rows: (Row | null)[]): string[] {
  const out = new Set<string>();
  for (const row of rows) {
    const value = row?.[key];
    if (typeof value === "string" && value) out.add(value);
  }
  return [...out];
}

// Collects the detail pages a write affects. The lookups run in parallel; a failed lookup only
// loses that set of pages (logged), the rest of the write's invalidation still happens.
class AffectedPages {
  private paths = new Set<string>();
  private pending: Promise<void>[] = [];
  private client: ReturnType<typeof createAdminClient> | null = null;

  private get supabase() {
    return (this.client ??= createAdminClient());
  }

  add(path: string) {
    this.paths.add(path);
  }

  // Own page of an entity, from the record itself: both slugs on a rename (the old one now
  // redirects, and its cached copy must not keep serving the old page).
  ownSlugs(prefix: string, ...rows: (Row | null)[]) {
    for (const slug of valuesOf("slug", ...rows)) this.add(`${prefix}/${slug}`);
  }

  eventsFromRows(...rows: (Row | null)[]) {
    for (const row of rows) {
      if (typeof row?.short_id === "string" && typeof row?.title === "string") {
        this.add(`/events/${buildEventSlug(row.short_id, row.title)}`);
      }
    }
  }

  events(ids: string[]) {
    this.lookup(ids, async () => {
      const { data, error } = await this.supabase.from("events").select("short_id, title").in("id", ids);
      if (error) throw error;
      this.eventsFromRows(...(data as Row[]));
    });
  }

  profiles(ids: string[]) {
    this.slugsOf("profiles", "/teachers", ids);
  }

  venues(ids: string[]) {
    this.slugsOf("venues", "/venues", ids);
  }

  communities(ids: string[]) {
    this.slugsOf("communities", "/communities", ids);
  }

  // The other side of a link table, e.g. every event a profile is credited on.
  linked(table: string, matchColumn: string, matchIds: string[], selectColumn: string, then: (ids: string[]) => void) {
    this.lookup(matchIds, async () => {
      const { data, error } = await this.supabase.from(table).select(selectColumn).in(matchColumn, matchIds);
      if (error) throw error;
      const ids = valuesOf(selectColumn, ...(data as unknown as Row[]));
      if (ids.length) then(ids);
    });
  }

  // Waits for lookups, including ones started by other lookups, then revalidates every path once.
  async flush() {
    while (this.pending.length) {
      const batch = this.pending.splice(0);
      await Promise.all(batch);
    }
    for (const path of this.paths) revalidatePath(path);
    return this.paths.size;
  }

  private slugsOf(table: string, prefix: string, ids: string[]) {
    this.lookup(ids, async () => {
      const { data, error } = await this.supabase.from(table).select("slug").in("id", ids);
      if (error) throw error;
      this.ownSlugs(prefix, ...(data as Row[]));
    });
  }

  private lookup(ids: string[], run: () => Promise<void>) {
    if (!ids.length) return;
    this.pending.push(
      run().catch((e) => console.error(`[revalidate] lookup failed: ${e instanceof Error ? e.message : String(e)}`)),
    );
  }
}

export async function POST(request: NextRequest) {
  if (!REVALIDATE_SECRET) {
    console.error("REVALIDATE_SECRET not configured");
    return NextResponse.json({ error: "not configured" }, { status: 500 });
  }

  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${REVALIDATE_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const payload = (await request.json()) as WebhookPayload;
  const { record: rec, old_record: old } = payload;
  const record = rec ?? old;
  const pages = new AffectedPages();

  switch (payload.table) {
    case "events": {
      invalidateSnapshot(CACHE_TAGS.events);
      // The people list (getListedPeople) counts credits on published/archived events only, so an
      // event entering or leaving those statuses can add or drop a person. old_record is null on
      // INSERT, record on DELETE.
      if (rec?.status !== old?.status) invalidateSnapshot(CACHE_TAGS.profiles);
      revalidatePath("/");
      // I-167: the type-listing pages (/festivals etc.) read from the same events table as the
      // homepage but are separate static routes, so they need the same on-write revalidation the
      // homepage already gets here. Revalidating all five on every events write (not just the
      // changed row's type) is deliberately simple: type changes are rare and the operation is cheap.
      for (const typePage of EVENT_TYPE_PAGES) revalidatePath(typePage.path);
      revalidateCountryFor(rec, old);
      // Its own page (old slug too when the title changed), its venue (old and new), and everyone
      // credited on it. The nightly archive fires this per archived row, which is exactly the set
      // of pages whose upcoming/past split changed. On DELETE the link rows are cascade-deleted and
      // fire their own triggers, so the lookups finding nothing is fine.
      pages.eventsFromRows(rec, old);
      pages.venues(valuesOf("venue_id", rec, old));
      const eventIds = valuesOf("id", record);
      pages.linked("event_teachers", "event_id", eventIds, "teacher_id", (ids) => pages.profiles(ids));
      pages.linked("event_organizers", "event_id", eventIds, "organizer_id", (ids) => pages.profiles(ids));
      pages.linked("event_organizers", "event_id", eventIds, "community_id", (ids) => pages.communities(ids));
      break;
    }
    case "profiles": {
      invalidateSnapshot(CACHE_TAGS.profiles);
      revalidatePath("/teachers");
      revalidateCountryFor(rec, old);
      pages.ownSlugs("/teachers", rec, old);
      // Pages that show this person's name: the events crediting them, and the venues and
      // communities linked to them.
      const ids = valuesOf("id", record);
      pages.linked("event_teachers", "teacher_id", ids, "event_id", (e) => pages.events(e));
      pages.linked("event_organizers", "organizer_id", ids, "event_id", (e) => pages.events(e));
      pages.linked("venue_profiles", "profile_id", ids, "venue_id", (v) => pages.venues(v));
      pages.linked("community_profiles", "profile_id", ids, "community_id", (c) => pages.communities(c));
      break;
    }
    case "venues": {
      invalidateSnapshot(CACHE_TAGS.venues);
      revalidatePath("/venues");
      revalidateCountryFor(rec, old);
      pages.ownSlugs("/venues", rec, old);
      const ids = valuesOf("id", record);
      pages.linked("events", "venue_id", ids, "id", (e) => pages.events(e));
      pages.linked("community_venues", "venue_id", ids, "community_id", (c) => pages.communities(c));
      pages.linked("venue_profiles", "venue_id", ids, "profile_id", (p) => pages.profiles(p));
      break;
    }
    case "communities": {
      invalidateSnapshot(CACHE_TAGS.communities);
      revalidatePath("/communities");
      revalidateCountryFor(rec, old);
      pages.ownSlugs("/communities", rec, old);
      const ids = valuesOf("id", record);
      pages.linked("event_organizers", "community_id", ids, "event_id", (e) => pages.events(e));
      pages.linked("community_profiles", "community_id", ids, "profile_id", (p) => pages.profiles(p));
      pages.linked("community_venues", "community_id", ids, "venue_id", (v) => pages.venues(v));
      break;
    }
    // Link tables (I-175 gap 1): both sides' pages, from the new and the old row, so a removed or
    // re-pointed link refreshes the page it was removed from. The people list counts event credits,
    // so the two credit tables also reload it. No other list snapshot shows links.
    case "event_teachers": {
      invalidateSnapshot(CACHE_TAGS.profiles);
      pages.events(valuesOf("event_id", rec, old));
      pages.profiles(valuesOf("teacher_id", rec, old));
      break;
    }
    case "event_organizers": {
      invalidateSnapshot(CACHE_TAGS.profiles);
      pages.events(valuesOf("event_id", rec, old));
      pages.profiles(valuesOf("organizer_id", rec, old));
      pages.communities(valuesOf("community_id", rec, old));
      break;
    }
    case "community_profiles": {
      pages.communities(valuesOf("community_id", rec, old));
      pages.profiles(valuesOf("profile_id", rec, old));
      break;
    }
    case "community_venues": {
      pages.communities(valuesOf("community_id", rec, old));
      pages.venues(valuesOf("venue_id", rec, old));
      break;
    }
    case "venue_profiles": {
      pages.venues(valuesOf("venue_id", rec, old));
      pages.profiles(valuesOf("profile_id", rec, old));
      break;
    }
    // Gated group invites show on the parent's page only. These used to reach the webhook by
    // touching the parent's updated_at (20261023140000_invites_touch_parent.sql), which the
    // updated_at-only WHEN clause on the entity triggers now deliberately ignores.
    case "profile_invites": {
      pages.profiles(valuesOf("profile_id", rec, old));
      break;
    }
    case "venue_invites": {
      pages.venues(valuesOf("venue_id", rec, old));
      break;
    }
    case "country_summaries": {
      // Table only carries `iso`, not a slug — same derivation getAllCountrySummaries() uses
      // (lib/country-pages.ts), kept in sync here since this route can't import a server-only
      // Supabase helper just to look up a string transform.
      if (record?.iso) {
        revalidatePath(`/${slugify(getCountryLabel(record.iso as string))}`);
        // A new summary is a new page: the index and the sitemap list it too, so a crawler sent
        // to the sitemap finds it the same day instead of after their daily timers.
        revalidatePath("/countries");
        revalidatePath("/sitemap.xml");
      }
      break;
    }
    default:
      return NextResponse.json({ error: "unknown table" }, { status: 400 });
  }

  const detailPages = await pages.flush();
  return NextResponse.json({ revalidated: true, table: payload.table, detailPages });
}
