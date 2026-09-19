import type { createAdminClient } from "@/lib/supabase/admin";
import { slugify } from "@/lib/events";

// Shared by every path that inserts a new profiles row outside a migration/enrichment script:
// self-submission (app/dashboard/new-profile) and organizer-suggested teacher stubs
// (app/events/actions.ts's suggestPersonProfile). idx_profiles_slug is UNIQUE on lower(slug).
export async function uniqueProfileSlug(
  admin: ReturnType<typeof createAdminClient>,
  name: string,
): Promise<string> {
  const base = slugify(name) || "profile";
  let candidate = base;
  for (let i = 2; i < 100; i += 1) {
    const { data } = await admin
      .from("profiles")
      .select("id")
      .ilike("slug", candidate)
      .maybeSingle();
    if (!data) {
      return candidate;
    }
    candidate = `${base}-${i}`;
  }
  // Extremely unlikely fallback: suffix with a random token.
  return `${base}-${Math.random().toString(36).slice(2, 7)}`;
}
