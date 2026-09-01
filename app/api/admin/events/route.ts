import { NextResponse, type NextRequest } from "next/server";

import { requireAdminRequestUser } from "@/lib/admin-api";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveExternalEventImage } from "@/lib/rehost-image";
import { resolveVenueLocation } from "@/lib/geocode";

import { setEntityEmail } from "@/lib/entity-email";
function normalizeJsonItems<T>(items: T[]) {
  return items.length ? { items } : null;
}

function parsePriceItems(items: Array<{ amount: string; currency: string; description: string }>) {
  return items
    .map((item) => {
      const amount = item.amount.trim();
      return {
        amount: amount ? Math.round(Number.parseFloat(amount) * 100) : null,
        currency: item.currency.trim() || "EUR",
        description: item.description.trim() || undefined,
      };
    })
    .filter((item) => item.amount !== null || item.description || item.currency);
}

function parseLinkItems(items: Array<{ type: string; url: string }>) {
  return items
    .map((item) => ({
      type: item.type.trim() || "website",
      url: item.url.trim(),
    }))
    .filter((item) => item.url);
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAdminRequestUser(request);
    const payload = await request.json();
    const supabase = createAdminClient();

    let imageUrl: string | null = payload.imageUrl || null;
    if (imageUrl) {
      const resolved = await resolveExternalEventImage(imageUrl);
      imageUrl = resolved.imageUrl;
    }

    const { venue_id, address, lat, lng } = await resolveVenueLocation(
      supabase,
      payload.venueId ?? null,
      payload.venueName ?? "",
      payload.city ?? "",
      payload.country ?? "",
    );

    const { data, error } = await supabase
      .from("events")
      .insert({
        title: payload.title,
        type: payload.type,
        status: payload.status,
        start_date: payload.startDate,
        end_date: payload.endDate,
        timezone: payload.timezone,
        city: payload.city,
        country: payload.country,
        description: payload.description || null,
        image_url: imageUrl,
        cancelled: Boolean(payload.cancelled),
        cancelled_text: payload.cancelled ? payload.cancelledText || "" : null,
        hide: Boolean(payload.hide),
        venue_id,
        address,
        ...(lat != null && lng != null ? { lat, lng } : {}),
        price: normalizeJsonItems(parsePriceItems(payload.priceItems ?? [])),
        links: normalizeJsonItems(parseLinkItems(payload.linkItems ?? [])),
        source: "manual",
        user_id: user.id,
        updated_by: user.id,
      })
      .select("id")
      .single();

    if (error) {
      throw error;
    }

    // I-165 F3: the address lives in entity_emails, which denies anon/authenticated, not in
    // a column on the public events table. Admin auth for this route is already established
    // above; setEntityEmail does no authorization of its own.
    await setEntityEmail("event", data.id, payload.contactEmail ?? null);

    // Found live 2026-07-22: the create form already shows a Teachers/Organizers picker and
    // keeps selections in local state, but this route never persisted them — an admin who
    // added a teacher before their first save would have it silently discarded on submit
    // (the redirect to /admin/events/[id]/edit reloads teachers fresh from the DB, which had
    // nothing). Mirrors the PUT route's insert logic (no delete needed — this is a new row).
    const teacherRows = (payload.teachers ?? []).map((item: { profileId: string; role: string }) => ({
      event_id: data.id,
      teacher_id: item.profileId,
      role: item.role,
    }));
    if (teacherRows.length) {
      const { error: teachersError } = await supabase.from("event_teachers").insert(teacherRows);
      if (teachersError) throw teachersError;
    }

    const organizerRows = (payload.organizers ?? []).map((item: { profileId: string; role: string }) => ({
      event_id: data.id,
      organizer_id: item.profileId,
      role: item.role,
    }));
    if (organizerRows.length) {
      const { error: organizersError } = await supabase.from("event_organizers").insert(organizerRows);
      if (organizersError) throw organizersError;
    }

    return NextResponse.json({ id: data.id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create event." },
      { status: 500 },
    );
  }
}
