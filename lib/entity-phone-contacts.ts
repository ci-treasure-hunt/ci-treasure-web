import { createAdminClient } from "@/lib/supabase/admin";
import type { ContactEntityType } from "@/lib/entity-visibility";
import type { CleanPhoneContact, PhoneContactInput, PhoneContactChannel } from "@/lib/phone-contacts";

// The single write path for entity_phone_contacts, same contract as setEntityEmail in
// lib/entity-email.ts.
//
// entity_phone_contacts grants nothing to anon or authenticated, so this uses the service role and
// does NO authorization of its own: callers must have already established that the current user
// may edit the entity. Every caller does, by running it only after their own RLS-guarded or
// admin-checked write to the parent row succeeded.
//
// Deliberately not a "use server" module: that would hand anyone an unauthenticated way to rewrite
// any entity's numbers.
export async function setEntityPhoneContacts(
  entityType: ContactEntityType,
  entityId: string,
  contacts: CleanPhoneContact[],
  source: "self_service" | "admin" = "self_service",
): Promise<{ error?: string }> {
  const admin = createAdminClient();

  // Replace the whole set: the form always submits every row it shows. The has_phone_contacts flag
  // on the parent follows via the entity_phone_contacts_sync_flag trigger.
  const { error: deleteError } = await admin
    .from("entity_phone_contacts")
    .delete()
    .eq("entity_type", entityType)
    .eq("entity_id", entityId);
  if (deleteError) return { error: deleteError.message };

  if (!contacts.length) return {};

  const { error } = await admin.from("entity_phone_contacts").insert(
    contacts.map((c, i) => ({
      entity_type: entityType,
      entity_id: entityId,
      channel: c.channel,
      number: c.number,
      label: c.label,
      sort_order: i,
      source,
    })),
  );
  return error ? { error: error.message } : {};
}

// Reads the numbers for prefilling an edit form. Server-only, no gate: only for paths that have
// already authorized the caller (the owner's own edit page, the admin editor). Anything public goes
// through getProtectedPhoneContacts instead.
export async function getEntityPhoneContacts(
  entityType: ContactEntityType,
  entityId: string,
): Promise<PhoneContactInput[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("entity_phone_contacts")
    .select("channel, number, label")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("sort_order")
    .order("created_at");
  return (data ?? []).map((row) => ({
    channel: row.channel as PhoneContactChannel,
    // Shown with its '+' so the organizer sees the international format they are asked for.
    number: `+${row.number as string}`,
    label: (row.label as string | null) ?? "",
  }));
}
