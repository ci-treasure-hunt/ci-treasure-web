import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// I-172: crawler traffic outweighs human traffic here by roughly an order of magnitude, and
// every crawl of a stale page used to trigger a regeneration — that is what consumed the Vercel
// ISR Write quota (2026-09-10, 184k/200k) and most of the Fluid Active CPU. Longer revalidate
// intervals are the primary fix; this cuts the request volume itself.
//
// Deliberately NOT blocked, all of them would look like obvious candidates:
//   facebookexternalhit, Twitterbot, LinkedInBot, TelegramBot, WhatsApp, Slackbot — these are
//     link-preview fetchers, not crawlers. Blocking them strips the image and title from every
//     link Jan posts, which is the main distribution channel (9 FB groups, TG channel).
//   AhrefsBot — Ahrefs' site audit is our own SEO tooling (I-150); blocking it breaks our
//     reports, not someone else's.
//   Googlebot, Bingbot, DuckDuckBot, Applebot — the actual search referral sources.
// Google-Extended and Applebot-Extended below only opt out of AI training. Neither affects
// Google Search or Siri results.
//
// Note this file is advisory: well-run crawlers honour it, scrapers do not. Bytespider in
// particular has a poor reputation for compliance. If the load does not drop, the remedy is
// firewall-level blocking, not a longer list here.
const BLOCKED_AI_AND_SEO_BOTS = [
  // AI training / answer-engine crawlers
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  "ClaudeBot",
  "Claude-Web",
  "anthropic-ai",
  "PerplexityBot",
  "Google-Extended",
  "Applebot-Extended",
  "Meta-ExternalAgent",
  "Amazonbot",
  "Bytespider",
  "CCBot",
  "Diffbot",
  "ImagesiftBot",
  "Omgilibot",
  "Timpibot",
  // Commercial SEO / backlink crawlers we get no value from
  "SemrushBot",
  "DataForSeoBot",
  "BLEXBot",
  "Barkrowler",
  "MJ12bot",
  "DotBot",
];

export default function robots(): MetadataRoute.Robots {
  return {
    // Auth-gated utility pages (dashboard, claim flows, event submission/edit) have no
    // unique public content to rank and would otherwise get crawled as a pile of
    // near-duplicate /auth?next=... URLs once a bot follows the sign-in redirect — wasted
    // crawl budget, not a security boundary (the real gate is proxy.ts's auth check).
    rules: [
      ...BLOCKED_AI_AND_SEO_BOTS.map((userAgent) => ({ userAgent, disallow: "/" })),
      {
        userAgent: "*",
        allow: "/",
        // /api/ isn't a security boundary either (same as the rest of this list) — these are
        // JSON endpoints with no unique content to rank, not linked from anywhere crawlable, but
        // blocking them rules out any chance of a response surfacing in search results and saves
        // crawl budget.
        disallow: ["/admin/", "/dashboard/", "/auth", "/events/new", "/events/*/edit", "/api/"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
