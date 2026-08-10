import { createClient } from "@supabase/supabase-js";

// @supabase/storage-js's upload() has two body-handling paths: a Blob/FormData body (routes
// through native multipart encoding, binary-safe) and a raw Buffer body (goes through a
// different internal serialization that silently corrupts binary content on this Next.js/
// Vercel stack — reproduced live 2026-08-10: every non-ASCII byte replaced with a UTF-8
// U+FFFD sequence, confirmed independent of which `fetch` implementation the client uses).
// Every call to `.storage.from(...).upload()` with in-memory image bytes MUST wrap the
// buffer with this first — passing a raw Buffer/Uint8Array directly is the one thing proven
// to break. See docs/issues/i-122-image-handling.md for the full investigation.
export function toStorageBody(buffer: Buffer, contentType: string): Blob {
  return new Blob([new Uint8Array(buffer)], { type: contentType });
}

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Missing Supabase service role environment variables.");
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
