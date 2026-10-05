import { createAdminClient } from "@/lib/supabase/admin";

export type ContactEntityType = "event" | "profile" | "venue" | "community";

// The parent must be publicly visible before any of its gated contact details are released.
//
// I-165 F3: the email reveal used to be a bare `.eq("id", entityId)` against the entity's own table
// with no status/visibility check, on the service-role client which bypasses RLS. Anyone holding the
// UUID of a pending event or a shadow profile could pull its address, Turnstile and rate limit
// notwithstanding. The conditions below deliberately mirror exactly what the public detail pages
// already require (getVenueBySlug and getTeacherBySlug both filter visibility = 'public'; the events
// condition is the events RLS policy itself), so nothing reachable loses its button.
//
// Shared by the email and phone-contact reveals so the two can never drift apart. Deliberately not a
// "use server" module: exporting this from one would make it a callable server action.
export async function parentIsPublic(
  admin: ReturnType<typeof createAdminClient>,
  entityType: ContactEntityType,
  entityId: string,
): Promise<boolean> {
  switch (entityType) {
    case "event": {
      const { data } = await admin
        .from("events")
        .select("id")
        .eq("id", entityId)
        .eq("hide", false)
        .in("status", ["published", "archived"])
        .maybeSingle();
      return Boolean(data);
    }
    case "profile": {
      const { data } = await admin
        .from("profiles")
        .select("id")
        .eq("id", entityId)
        .eq("visibility", "public")
        .maybeSingle();
      return Boolean(data);
    }
    case "venue": {
      const { data } = await admin
        .from("venues")
        .select("id")
        .eq("id", entityId)
        .eq("visibility", "public")
        .maybeSingle();
      return Boolean(data);
    }
    case "community": {
      const { data } = await admin
        .from("communities")
        .select("id")
        .eq("id", entityId)
        .is("deleted_at", null)
        .maybeSingle();
      return Boolean(data);
    }
  }
}
