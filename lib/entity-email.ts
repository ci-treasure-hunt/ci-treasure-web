import { createAdminClient } from "@/lib/supabase/admin";

export type EmailEntityType = "event" | "profile" | "venue" | "community";

// I-165 F3: the single write path for every contact address on the site.
//
// `entity_emails` grants nothing to anon or authenticated (deny-all by REVOKE and by
// RLS-with-no-policies), so the service role is the only way to write it. That means this helper
// does NO authorization of its own and cannot: callers must have already established that the
// current user may edit the entity in question. Every caller today does, via the same ownership
// checks that guard the rest of the write it belongs to.
//
// Deliberately not exported from a "use server" module (see lib/notify.ts and I-166 F3): making
// this a server action would hand anyone an unauthenticated way to rewrite any entity's address.
export async function setEntityEmail(
  entityType: EmailEntityType,
  entityId: string,
  email: string | null,
): Promise<{ error?: string }> {
  const admin = createAdminClient();
  const value = email?.trim() || null;

  // Clearing the field means deleting the row, not storing an empty string. The has_email flag on
  // the parent table follows automatically via the entity_emails_sync_flag trigger.
  if (!value) {
    const { error } = await admin
      .from("entity_emails")
      .delete()
      .eq("entity_type", entityType)
      .eq("entity_id", entityId);
    return error ? { error: error.message } : {};
  }

  const { error } = await admin.from("entity_emails").upsert(
    {
      entity_type: entityType,
      entity_id: entityId,
      email: value,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "entity_type,entity_id" },
  );
  return error ? { error: error.message } : {};
}

// Reads the real address for an entity. Server-only, no gate: this is for paths that have already
// authorized the caller, i.e. the owner prefilling their own edit form and the admin preview
// screen. Anything public-facing must go through getProtectedEmail instead, which adds Turnstile,
// the rate limit, the reveal log and a parent-visibility check.
export async function getEntityEmail(
  entityType: EmailEntityType,
  entityId: string,
): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("entity_emails")
    .select("email")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .maybeSingle();
  return (data?.email as string | undefined) ?? null;
}
