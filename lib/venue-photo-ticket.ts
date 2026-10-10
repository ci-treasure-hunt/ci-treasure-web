import { createHmac, timingSafeEqual } from "crypto";

// I-181: lets /venues/new attach a photo to the venue its submission just created or matched.
// Same shape as lib/community-photo-ticket.ts (a server action can't carry the file, so the photo
// goes to /api/venues/photo right after), with its own prefix so one ticket can never stand in for
// the other. Valid 15 minutes, for that one venue. Server-only.

const TTL_MS = 15 * 60 * 1000;

function sign(venueId: string, expires: number): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createHmac("sha256", key).update(`venue-photo:${venueId}:${expires}`).digest("hex");
}

export function createVenuePhotoTicket(venueId: string): string {
  const expires = Date.now() + TTL_MS;
  return `${expires}.${sign(venueId, expires)}`;
}

export function verifyVenuePhotoTicket(venueId: string, ticket: string): boolean {
  const [expiresRaw, signature] = String(ticket ?? "").split(".");
  const expires = Number(expiresRaw);
  if (!Number.isFinite(expires) || expires < Date.now() || !signature) return false;
  const expected = Buffer.from(sign(venueId, expires), "hex");
  const given = Buffer.from(signature, "hex");
  return expected.length === given.length && timingSafeEqual(expected, given);
}
