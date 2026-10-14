// I-173 option F: the support link and where it is shown. Every on-site or emailed link goes
// through /support?from=<source> (app/support/route.ts), which counts the click in support_clicks
// and redirects to SUPPORT_TARGET. Add a source here before using it; unknown ones count as "other".

export const SUPPORT_TARGET = "https://buymeacoffee.com/citreasurehunt";

export const SUPPORT_SOURCES = ["footer", "submit", "approval_email", "lnkbio", "newsletter", "telegram"] as const;
export type SupportSource = (typeof SUPPORT_SOURCES)[number];

export function supportHref(source: SupportSource, absolute = false) {
  return `${absolute ? "https://citreasurehunt.com" : ""}/support?from=${source}`;
}

// Appended to the "your event is live" emails (app/admin/events/pending/actions.ts). First person,
// like the About page: the ask lands better from a person than from a brand. "Support", not
// "donation": it is taxable income and there is no donation receipt (I-173 spec).
export const SUPPORT_EMAIL_LINES = [
  "Listing events on CI Treasure Hunt is free, and it stays free. I build and run it on my own, so if",
  "it helps you reach dancers, a small monthly contribution keeps it going:",
  supportHref("approval_email", true),
];
