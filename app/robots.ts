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
  // Model-training crawlers. Blocking these costs nothing: none of them send a visitor or a
  // citation back, they only ingest.
  "GPTBot", // OpenAI, training
  "ClaudeBot", // Anthropic, training
  "anthropic-ai", // Anthropic, legacy training agent
  "Google-Extended", // Gemini training only; no effect on Google Search
  "Applebot-Extended", // Apple AI training only; plain Applebot (Siri/Spotlight) stays allowed
  "Meta-ExternalAgent", // Meta AI training; facebookexternalhit (link previews) is separate
  // Amazonbot was here until 2026-09-21, removed deliberately. Amazon runs three agents and the
  // other two, Amzn-SearchBot and Amzn-User, were never listed, so they fell through to "*" and
  // were allowed. Blocking one of three bought nothing: Amazon reached the same pages anyway,
  // and the only effect was the split policy Ahrefs flags. Amazon publishes no training-only
  // opt-out agent (no equivalent of Google-Extended), so the choice was all-in or all-out, and
  // in is consistent with the reasoning below for ChatGPT-User and friends: Alexa and Rufus are
  // assistant surfaces where being the answer to "where are the CI festivals in Portugal" is
  // the point. To reverse, put "Amazonbot" back and add "Amzn-SearchBot" and "Amzn-User".
  "Bytespider", // ByteDance/TikTok; heavy, and a poor robots-compliance record
  "CCBot", // Common Crawl, the dataset most training corpora are built from
  // Added 2026-09-21. Ahrefs' "inconsistent AI training bot policy" check was right: these two
  // are training crawlers of exactly the kind the list above blocks, and were allowed only
  // because their user agents were not known when this file was written (the note further down
  // used to say DeepSeek had no identifier that could be verified).
  //
  // Both carry a caveat worth knowing rather than discovering later: DeepSeek and xAI publish
  // these names, but multiple independent reports have them crawling with ordinary browser user
  // agents instead, so neither rule may bind anything in practice. They cost a line each and
  // close the stated-policy gap; they are not a guarantee. Firewall rules are the real remedy
  // if the traffic shows up, same as the Bytespider note above.
  "DeepSeekBot", // matching is case-insensitive, so this also covers "DeepseekBot"
  "xAI-Bot",
  "xAI-Grok",
  "GrokBot",
  // Grok-DeepSearch is deliberately NOT blocked: it is the user-triggered, citing side of xAI,
  // which belongs with ChatGPT-User and Claude-User in the allowed list below.
  // Scrapers and dataset resellers
  "Diffbot",
  "ImagesiftBot",
  "Omgilibot",
  "Timpibot",
  // Added 2026-09-10 from the firewall's Top User Agents (24h): real volume, near-zero referral
  // value for a Contact Improvisation directory specifically.
  "PetalBot", // Huawei/Petal Search, 288 hits/24h — a real search engine, but not one this
  // audience uses; unlike Googlebot/Bingbot this is a judgment call, not a given.
  "LumiaBot", // 230 hits/24h, unidentified purpose, no known referral value
  // Commercial SEO / backlink crawlers we get no value from
  "SemrushBot",
  "DataForSeoBot",
  "BLEXBot",
  "Barkrowler",
  "MJ12bot",
  "DotBot",
];

// Deliberately ALLOWED, and the distinction matters more than it looks. Each vendor runs separate
// crawlers for separate jobs, under separate user agents:
//   1. training      - ingests pages to train a model. Blocked above.
//   2. user-triggered - fetches a page live because a person asked the assistant about it.
//   3. search index   - builds the index an assistant cites and links from.
// Only (1) is a pure taking. (2) and (3) are how this site becomes the answer when someone asks
// an assistant "where are the CI festivals in Portugal", which is the same job Google Search does
// for us and is squarely in the project's interest. So these stay allowed:
//   ChatGPT-User, OAI-SearchBot          (OpenAI: live fetch, and the ChatGPT search index)
//   Claude-User, Claude-SearchBot        (Anthropic: same split)
//   PerplexityBot, Perplexity-User       (Perplexity: index, and live fetch)
// They cost crawl volume, which is the thing we are trying to reduce, and that is a real
// trade accepted knowingly: user-triggered fetches scale with actual interest rather than
// sweeping the site, and the index crawlers behave more like Googlebot than like a scraper.
// Caveat: Perplexity has been publicly documented fetching pages that robots.txt disallowed, so
// treat a rule against it as unreliable either way.
// DeepSeek has no crawler user agent I could verify, so nothing here covers it.


export default function robots(): MetadataRoute.Robots {
  return {
    // Auth-gated utility pages (dashboard, claim flows, event submission/edit) have no
    // unique public content to rank and would otherwise get crawled as a pile of
    // near-duplicate /auth?next=... URLs once a bot follows the sign-in redirect — wasted
    // crawl budget, not a security boundary (the real gate is proxy.ts's auth check).
    rules: [
      ...BLOCKED_AI_AND_SEO_BOTS.map((userAgent) => ({ userAgent, disallow: "/" })),
      // Link-preview fetchers, given their own group so the disallow list below does not reach
      // them. The note at the top of this file already says these are deliberately not blocked,
      // but that intent was silently defeated for the auth-gated paths: in robots.txt a named
      // agent obeys only its own matching group, and with no group of their own these all fell
      // back to "*". So every /events/new link Jan shared to a Facebook group or Telegram was
      // unpreviewable — no title, no description, no image — which matters most for exactly the
      // link an announcement post is built around (found 2026-09-21).
      //
      // Safe to open: a preview fetch is a single on-demand request for a URL someone already
      // chose to share, not a crawl, so it costs nothing in crawl budget or ISR writes (I-172).
      // These paths stay out of the search index via the "*" group below, which is untouched.
      {
        userAgent: [
          "facebookexternalhit", // Facebook, Messenger
          "Facebot",
          "Twitterbot",
          "LinkedInBot",
          "TelegramBot",
          "WhatsApp",
          "Slackbot-LinkExpanding",
          "Discordbot",
          // Applebot is deliberately NOT here: it renders iMessage previews but is also a real
          // search crawler, and giving it its own group would lift the "*" disallow and let it
          // index /dashboard and /auth. Losing the iMessage card is the cheaper side of that trade.
        ],
        allow: "/",
      },
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
