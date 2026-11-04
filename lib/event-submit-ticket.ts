import { createHmac, timingSafeEqual } from "crypto";

// I-192 stage 3: ties a signed-out event submission to the browser that made it, so step 2 (role,
// email) and the claim after sign-in can only act on that one pending event. Same HMAC shape as
// lib/venue-photo-ticket.ts with its own prefix, so no other ticket can stand in for it.
//
// Valid 48 hours, not 15 minutes: an organizer may finish signing in later (a magic link opened
// the next morning, or in another browser). Server-only.

const TTL_MS = 48 * 60 * 60 * 1000;

function sign(eventId: string, expires: number): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createHmac("sha256", key).update(`event-submission:${eventId}:${expires}`).digest("hex");
}

export function createEventSubmitTicket(eventId: string): string {
  const expires = Date.now() + TTL_MS;
  return `${expires}.${sign(eventId, expires)}`;
}

export function verifyEventSubmitTicket(eventId: string, ticket: string | null | undefined): boolean {
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) return false;
  const [expiresRaw, signature] = String(ticket ?? "").split(".");
  const expires = Number(expiresRaw);
  if (!Number.isFinite(expires) || expires < Date.now() || !signature || !/^[0-9a-f]+$/i.test(signature)) {
    return false;
  }
  const expected = Buffer.from(sign(eventId, expires), "hex");
  const given = Buffer.from(signature, "hex");
  return expected.length === given.length && timingSafeEqual(expected, given);
}

// The flyer uploaded with step 1 (app/api/events/flyer): a server action can't carry the file, so
// it goes to the route right after the save, with this ticket. Own prefix and 15 minutes, like the
// venue photo ticket; valid for that one event only.
const FLYER_TTL_MS = 15 * 60 * 1000;

function signFlyer(eventId: string, expires: number): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createHmac("sha256", key).update(`event-flyer:${eventId}:${expires}`).digest("hex");
}

export function createEventFlyerTicket(eventId: string): string {
  const expires = Date.now() + FLYER_TTL_MS;
  return `${expires}.${signFlyer(eventId, expires)}`;
}

export function verifyEventFlyerTicket(eventId: string, ticket: string | null | undefined): boolean {
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) return false;
  const [expiresRaw, signature] = String(ticket ?? "").split(".");
  const expires = Number(expiresRaw);
  if (!Number.isFinite(expires) || expires < Date.now() || !signature || !/^[0-9a-f]+$/i.test(signature)) {
    return false;
  }
  const expected = Buffer.from(signFlyer(eventId, expires), "hex");
  const given = Buffer.from(signature, "hex");
  return expected.length === given.length && timingSafeEqual(expected, given);
}
