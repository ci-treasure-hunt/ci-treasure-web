import { createHmac, timingSafeEqual } from "crypto";

// I-111 3a: lets the public Add form attach a photo to the community it just created.
//
// The Add form is a server action (JSON, 1MB body limit), so the photo goes separately to
// /api/communities/photo right after it. That route normally demands a fresh Turnstile token, but
// the form's token was already spent on the submission. Instead, submitCommunity() hands back this
// ticket: an HMAC over the new community's id and an expiry, valid for 15 minutes and only for that
// community. Server-only (imports crypto and reads the service key).

const TTL_MS = 15 * 60 * 1000;

function secret(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return key;
}

function sign(communityId: string, expires: number): string {
  return createHmac("sha256", secret()).update(`community-photo:${communityId}:${expires}`).digest("hex");
}

export function createPhotoTicket(communityId: string): string {
  const expires = Date.now() + TTL_MS;
  return `${expires}.${sign(communityId, expires)}`;
}

export function verifyPhotoTicket(communityId: string, ticket: string): boolean {
  const [expiresRaw, signature] = String(ticket ?? "").split(".");
  const expires = Number(expiresRaw);
  if (!Number.isFinite(expires) || expires < Date.now() || !signature) return false;
  const expected = Buffer.from(sign(communityId, expires), "hex");
  const given = Buffer.from(signature, "hex");
  return expected.length === given.length && timingSafeEqual(expected, given);
}
