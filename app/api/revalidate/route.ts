import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";

import { buildEventSlug, slugify } from "@/lib/events";
import { getCountryLabel } from "@/lib/event-display";
import { EVENT_TYPE_PAGES } from "@/lib/event-type-pages";

// Called by a Supabase Database Webhook (pg_net trigger, see
// supabase/migrations/*_revalidate_on_write.sql) whenever a row changes in events, profiles, or
// venues — closes the ISR staleness gap for writes that happen outside the app (direct SQL/MCP,
// enrichment scripts), which never go through the server actions that already call revalidatePath
// for in-app edits. Communities will be added here once I-111 migrates them to Supabase-authoritative
// (see that issue's Sequencing section for the note).

const REVALIDATE_SECRET = process.env.REVALIDATE_SECRET;

type WebhookPayload = {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  record: Record<string, unknown> | null;
  old_record: Record<string, unknown> | null;
};

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
  const record = payload.record ?? payload.old_record;

  switch (payload.table) {
    case "events": {
      revalidatePath("/");
      // Path-pattern form revalidates every slug variant of the dynamic route, not just one —
      // matches the existing pattern in app/api/admin/events/[id]/route.ts.
      revalidatePath("/events/[eventSlug]", "page");
      if (record?.short_id && record?.title) {
        revalidatePath(`/events/${buildEventSlug(record.short_id as string, record.title as string)}`);
      }
      // I-167: the type-listing pages (/festivals etc.) read from the same events table as the
      // homepage but are separate static routes, so they need the same on-write revalidation the
      // homepage already gets here — without this they'd only refresh on the passive 1h ISR
      // cycle. Revalidating all five on every events write (not just the changed row's type) is
      // deliberately simple: type changes are rare, the operation is cheap, and old_record isn't
      // reliably available to target just one.
      for (const typePage of EVENT_TYPE_PAGES) revalidatePath(typePage.path);
      break;
    }
    case "profiles": {
      revalidatePath("/teachers");
      if (record?.slug) revalidatePath(`/teachers/${record.slug as string}`);
      break;
    }
    case "venues": {
      revalidatePath("/venues");
      if (record?.slug) revalidatePath(`/venues/${record.slug as string}`);
      break;
    }
    case "communities": {
      revalidatePath("/communities");
      if (record?.slug) revalidatePath(`/communities/${record.slug as string}`);
      break;
    }
    case "country_summaries": {
      // Table only carries `iso`, not a slug — same derivation getAllCountrySummaries() uses
      // (lib/country-pages.ts), kept in sync here since this route can't import a server-only
      // Supabase helper just to look up a string transform.
      if (record?.iso) {
        revalidatePath(`/${slugify(getCountryLabel(record.iso as string))}`);
      }
      break;
    }
    default:
      return NextResponse.json({ error: "unknown table" }, { status: 400 });
  }

  return NextResponse.json({ revalidated: true, table: payload.table });
}
