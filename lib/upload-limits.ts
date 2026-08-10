// Shared between client components (pre-check + copy) and the server-side upload route
// handlers (authoritative check). Vercel Functions hard-cap request bodies at 4.5MB —
// infra-level, not something next.config/vercel.json can raise — so this must stay under
// that regardless of what we'd otherwise want to allow. 4MB leaves headroom for multipart
// framing overhead (boundary/field text is a few hundred bytes, never close to the ~500KB
// margin here).
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
export const MAX_UPLOAD_MB = MAX_UPLOAD_BYTES / (1024 * 1024);
