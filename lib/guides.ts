import { readdir, readFile } from "fs/promises";
import path from "path";
import matter from "gray-matter";
import { marked } from "marked";

import { getSiteStats } from "@/lib/site-stats";
import { SITE_OG_IMAGE, SITE_URL } from "@/lib/site";

// I-148. Same files-in-git approach as lib/content-pages.ts (/about, /faq): Jan writes and edits
// the prose in the private ci-treasure-hunt repo, where the drafts carry editorial <!-- --> notes,
// and the file is copied here with those notes deleted as part of the move. Kept separate from
// content-pages.ts rather than folded into it because guides need things single pages don't:
// a byline, a visible "last updated" date, heading anchors, and an index that enumerates them.
const GUIDES_DIR = path.join(process.cwd(), "content", "guides");

export type GuideFrontmatter = {
  slug: string;
  title: string;
  description: string;
  keywords?: string[];
  ogImage?: string;
  author?: string;
  published?: string;
  updated?: string;
};

export type Guide = {
  frontmatter: GuideFrontmatter;
  /** The leading `# Heading`, as plain text. Hoisted out of `html` — see splitLeadingH1(). */
  heading: string;
  /** Body only: the leading H1 is removed so the page can put the byline between the two. */
  html: string;
  /** Rounded up, at 220 wpm — non-fiction prose read on a screen, not the 250-300 often quoted. */
  readingMinutes: number;
};

// Reading order, not alphabetical: the hub is meant to be walked top to bottom by someone new,
// so the pillar leads and the practical guides follow roughly in the order a dancer meets them
// (what it is -> vocabulary -> how it differs -> first jam -> finding it -> going away for a
// week). Anything not listed sorts to the end alphabetically, so a newly added file still shows
// up rather than disappearing.
const GUIDE_ORDER = [
  "what-is-contact-improvisation",
  "glossary",
  "contact-improvisation-vs-other-practices",
  "contact-improvisation-jam-etiquette",
  "how-to-find-ci-where-you-live",
  "how-to-find-ci-while-traveling",
  "first-ci-festival-prep",
];

// Windows checkouts (core.autocrlf) turn LF into CRLF, which silently breaks every regex below
// written against bare \n. Normalize once, at the read boundary. Same reasoning as content-pages.ts.
async function readGuideFile(slug: string): Promise<string> {
  const raw = await readFile(path.join(GUIDES_DIR, `${slug}.md`), "utf-8");
  return raw.replace(/\r\n/g, "\n");
}

// The editorial <!-- --> block is supposed to be gone before a file lands in this repo. This is
// the belt to that braces: a note that slips through would otherwise sit in the public HTML
// source, readable by anyone who hits View Source. Mirrors stripEditorialNotes() in
// content-pages.ts, which exists for the same reason.
// Same {token} substitution content-pages.ts does for /about, and for the same reason: a guide
// that writes "we list 274 communities" is stale the week after it's written, and nobody
// remembers to go back and edit prose. Tokens are the two totals from getSiteStats() that guide
// text actually quotes. Kept as a plain replace rather than a template engine, matching the
// existing precedent.
//
// Any number a guide states that ISN'T one of these has to be written so it can't contradict a
// live figure, which is why guide #14 says "many of the countries we list" instead of restating
// the country total in a second, hardcoded place.
async function interpolateStats(markdown: string): Promise<string> {
  if (!/\{[a-zA-Z]+\}/.test(markdown)) return markdown;
  const stats = await getSiteStats();
  return markdown.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = stats[key as keyof typeof stats];
    return value !== undefined ? String(value) : match;
  });
}

function stripEditorialComments(markdown: string): string {
  return markdown.replace(/<!--[\s\S]*?-->\n*/g, "");
}

// GitHub-flavoured heading slugs, because that is the dialect the glossary's hand-written index
// was authored against (31 "#term" links, all verified to resolve). marked emits bare <h2>/<h3>
// with no id, so without this every one of those links is dead. Post-processing the HTML rather
// than overriding marked's renderer deliberately: the renderer signature has changed across marked
// majors (v5 and again v16), a regex over the output has not.
function slugifyHeading(text: string): string {
  return text
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 \-_]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

// Each guide's markdown opens with its own `# Heading`, which is where an author expects to write
// it. Rendered as-is, that H1 lands *below* the byline block, so the page reads "By Jan, updated
// August 7" before it says what it is about. Splitting it out lets the route order them properly
// without asking every file to omit its own title.
function splitLeadingH1(html: string): { heading: string; body: string } {
  const match = html.match(/^\s*<h1[^>]*>([\s\S]*?)<\/h1>\s*/);
  if (!match) return { heading: "", body: html };
  return {
    heading: match[1].replace(/<[^>]+>/g, "").trim(),
    body: html.slice(match[0].length),
  };
}

function addHeadingIds(html: string): string {
  const seen = new Map<string, number>();
  return html.replace(/<h([2-4])>([\s\S]*?)<\/h\1>/g, (_match, level: string, inner: string) => {
    const base = slugifyHeading(inner);
    if (!base) return `<h${level}>${inner}</h${level}>`;
    // Duplicate headings get -1, -2 suffixes, matching GitHub, so an id is never emitted twice.
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    const id = count === 0 ? base : `${base}-${count}`;
    return `<h${level} id="${id}">${inner}</h${level}>`;
  });
}

// YAML parses an unquoted 2026-08-07 into a Date at UTC midnight. Formatting that with a
// local-timezone formatter renders "6 August" anywhere west of UTC, so both the parse and the
// display stay in UTC.
function toIsoDate(value: unknown): string | undefined {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  return undefined;
}

export function formatGuideDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function guideOgImage(frontmatter: GuideFrontmatter): string {
  // Guides carry `ogImage: default`, meaning "no bespoke image, use the site card". A real path
  // is honoured if one is ever set.
  const value = frontmatter.ogImage;
  if (!value || value === "default") return SITE_OG_IMAGE;
  return value.startsWith("http") ? value : `${SITE_URL}${value}`;
}

function normalizeFrontmatter(data: Record<string, unknown>, slug: string): GuideFrontmatter {
  const keywords = data.keywords;
  return {
    slug: typeof data.slug === "string" ? data.slug : slug,
    title: String(data.title ?? ""),
    description: String(data.description ?? ""),
    keywords: Array.isArray(keywords)
      ? keywords.map(String)
      : typeof keywords === "string"
        ? keywords.split(",").map((k) => k.trim())
        : undefined,
    ogImage: typeof data.ogImage === "string" ? data.ogImage : undefined,
    author: typeof data.author === "string" ? data.author : undefined,
    published: toIsoDate(data.published),
    updated: toIsoDate(data.updated),
  };
}

export async function getGuideSlugs(): Promise<string[]> {
  const files = await readdir(GUIDES_DIR);
  const slugs = files.filter((f) => f.endsWith(".md")).map((f) => f.replace(/\.md$/, ""));
  return slugs.sort((a, b) => {
    const ia = GUIDE_ORDER.indexOf(a);
    const ib = GUIDE_ORDER.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b);
  });
}

export async function getGuide(slug: string): Promise<Guide | null> {
  // Any traversal or odd character means "not a guide" — the filename comes from the URL.
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
  try {
    const raw = await readGuideFile(slug);
    const { data, content } = matter(raw);
    const cleaned = await interpolateStats(stripEditorialComments(content));
    const rendered = addHeadingIds(await marked.parse(cleaned));
    const { heading, body } = splitLeadingH1(rendered);
    const words = cleaned.split(/\s+/).filter(Boolean).length;
    const frontmatter = normalizeFrontmatter(data as Record<string, unknown>, slug);
    return {
      frontmatter,
      // Frontmatter `title` is SEO-shaped and often longer than the on-page headline wants to be
      // ("... : Terms & Definitions"). The body's own H1 wins for display; frontmatter is the
      // fallback for a file that omits one.
      heading: heading || frontmatter.title,
      html: body,
      readingMinutes: Math.max(1, Math.ceil(words / 220)),
    };
  } catch {
    return null;
  }
}

export async function getAllGuides(): Promise<Guide[]> {
  const slugs = await getGuideSlugs();
  const guides = await Promise.all(slugs.map((s) => getGuide(s)));
  return guides.filter((g): g is Guide => g !== null);
}
