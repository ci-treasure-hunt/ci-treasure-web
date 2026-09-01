import { EventForm } from "@/components/admin/event-form";
import {
  createEmptyEventFormData,
  type AdminEventFormData,
} from "@/lib/admin-events";
import { requireAdminUser } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";

import { getEntityEmail } from "@/lib/entity-email";
export default async function AdminEditEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminUser();
  const { id } = await params;
  const supabase = createAdminClient();

  const [{ data: event, error: eventError }, { data: teachers, error: teacherError }, { data: organizers, error: organizerError }] =
    await Promise.all([
      supabase
        .from("events")
        .select("id, title, type, status, start_date, end_date, timezone, city, country, address, venue_id, venues(id, name, city, country), description, image_url, cancelled, cancelled_text, hide, price, links")
        .eq("id", id)
        .single(),
      supabase
        .from("event_teachers")
        .select("teacher_id, role, profiles!inner(name)")
        .eq("event_id", id),
      supabase
        .from("event_organizers")
        .select("organizer_id, role, profiles!inner(name)")
        .eq("event_id", id),
    ]);

  if (eventError || !event) {
    throw new Error(eventError?.message ?? "Event not found.");
  }
  if (teacherError) {
    throw new Error(teacherError.message);
  }
  if (organizerError) {
    throw new Error(organizerError.message);
  }

  const address = typeof event.address === "object" && event.address ? (event.address as { venue_name?: string }) : null;
  const venue = Array.isArray(event.venues) ? event.venues[0] ?? null : (event.venues as { id: string; name: string; city: string; country: string } | null);
  const teacherRows = (teachers ?? []) as Array<{
    teacher_id: string;
    role: string;
    profiles: { name?: string } | Array<{ name?: string }> | null;
  }>;
  const organizerRows = (organizers ?? []) as Array<{
    organizer_id: string;
    role: string;
    profiles: { name?: string } | Array<{ name?: string }> | null;
  }>;
  const priceItems =
    typeof event.price === "object" && event.price && "items" in event.price && Array.isArray((event.price as { items?: unknown[] }).items)
      ? ((event.price as { items: Array<{ amount?: number | null; currency?: string; description?: string }> }).items ?? []).map((item) => ({
          amount: typeof item.amount === "number" ? String(item.amount / 100) : "",
          currency: item.currency ?? "EUR",
          description: item.description ?? "",
        }))
      : [];
  const linkItems =
    typeof event.links === "object" && event.links && "items" in event.links && Array.isArray((event.links as { items?: unknown[] }).items)
      ? ((event.links as { items: Array<{ type?: string; url?: string }> }).items ?? []).map((item) => ({
          type: item.type ?? "website",
          url: item.url ?? "",
        }))
      : [];

  const initialEvent: AdminEventFormData = {
    ...createEmptyEventFormData(),
    id: event.id,
    title: event.title,
    type: event.type,
    status: event.status,
    startDate: event.start_date,
    endDate: event.end_date,
    timezone: event.timezone,
    city: event.city,
    country: event.country,
    venueId: event.venue_id ?? null,
    venueLabel: venue ? `${venue.name} — ${venue.city}, ${venue.country}` : "",
    venueName: address?.venue_name ?? "",
    contactEmail: (await getEntityEmail("event", event.id)) ?? "",
    description: event.description ?? "",
    imageUrl: event.image_url ?? "",
    cancelled: event.cancelled,
    cancelledText: event.cancelled_text ?? "",
    hide: event.hide,
    priceItems,
    linkItems,
    teachers: teacherRows.map((item) => ({
      profileId: item.teacher_id,
      name: Array.isArray(item.profiles) ? item.profiles[0]?.name ?? "Unknown" : item.profiles?.name ?? "Unknown",
      role: item.role,
    })),
    organizers: organizerRows.map((item) => ({
      profileId: item.organizer_id,
      name: Array.isArray(item.profiles) ? item.profiles[0]?.name ?? "Unknown" : item.profiles?.name ?? "Unknown",
      role: item.role,
    })),
  };

  return <EventForm mode="edit" initialEvent={initialEvent} />;
}
