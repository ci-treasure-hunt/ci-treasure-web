// Maps a magic-link confirmation failure to a specific explanation, rather than one generic
// "sign-in failed" message. Written 2026-09-22 after two people reported the link "not working"
// with no way to tell which of a small, enumerable set of causes it was:
//   - the code_verifier cookie is missing because the link was opened in a different browser or
//     app than the one that requested it (common on mobile: the email app opens its own browser,
//     or a separate installed PWA has its own storage separate from the "outside" browser)
//   - the token was already consumed, often by an email security scanner (Outlook Safe Links,
//     Mimecast, Proofpoint and others all pre-fetch links before delivery) rather than by the
//     person clicking it
//   - the link genuinely expired
// GoTrue's own error text doesn't distinguish these for the person reading it, so this matches
// on the parts of the message that do distinguish them and gives a next step for each.
export function explainConfirmError(rawMessage: string | null | undefined): string {
  const msg = (rawMessage ?? "").toLowerCase();

  if (msg.includes("code verifier") || msg.includes("code challenge")) {
    return "This link was opened in a different browser or app than the one you used to request it, so it can't finish signing you in. Go back to the browser or app where you entered your email and open the link there, or request a new link below and open it in the same tab.";
  }
  if (msg.includes("expired")) {
    return "This link has expired. Request a new one below.";
  }
  if (msg.includes("already") || msg.includes("used") || msg.includes("invalid")) {
    return "This link has already been used, or is no longer valid. Sometimes an email provider's security scanner opens a link before you do, which uses it up. Request a new one below.";
  }
  // No specific match, including the "no code and no token_hash at all" case (a stripped or
  // truncated URL, or a scanner-consumed link that never reached us with anything usable). Never
  // leave this blank: a person who gets this far already had something go wrong once.
  return "This link didn't complete sign-in. It may have expired, been used already, or opened in a different browser than the one you started with. Request a new one below.";
}
