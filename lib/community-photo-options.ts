// I-111 3a: shared by the public photo dialog, the Add form and the upload route, so the consent
// wording on screen and the server's check never drift apart.

export const PHOTO_CONSENT_TEXT =
  "I took this photo or have permission to share it, and the people in it are fine with it being shown.";

/** File types the photo inputs offer; the server re-encodes everything to JPEG/WebP. */
export const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";
