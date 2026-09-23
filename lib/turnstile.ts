// Server-side Cloudflare Turnstile check. Fails closed: no secret configured means no verification.
// Same request as the inline checks in lib/invite-links-action.ts and lib/protected-email-action.ts
// (left as they are; they were written and reviewed under I-099 / I-165 F3).

export async function verifyTurnstile(token: string | null | undefined): Promise<boolean> {
  const secret = process.env.CF_TURNSTILE_SECRET_KEY;
  if (!secret || !token) return false;
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token }),
    });
    const verified = await res.json();
    return Boolean(verified?.success);
  } catch {
    return false;
  }
}
