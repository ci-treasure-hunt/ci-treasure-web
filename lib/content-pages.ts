import { readFile } from "fs/promises";
import path from "path";
import matter from "gray-matter";
import { marked } from "marked";

import { getSiteStats } from "@/lib/site-stats";
import { stripMarkdown } from "@/lib/events";

// I-156: content/pages/*.md, mirroring content/guides/'s files-in-git approach so Jan can edit
// prose directly without touching React. Moved here from ci-treasure-hunt (private repo) on
// 2026-08-30 -- the site builds and deploys from this repo only, and a markdown reader pointed
// at a sibling private repo would work locally but fail on Vercel, which has no access to it.
const CONTENT_DIR = path.join(process.cwd(), "content", "pages");

// Windows checkouts (core.autocrlf) turn these files' LF endings into CRLF, which silently
// breaks every regex below written against bare \n. Normalize once, at the read boundary.
async function readContentFile(slug: string): Promise<string> {
  const raw = await readFile(path.join(CONTENT_DIR, `${slug}.md`), "utf-8");
  return raw.replace(/\r\n/g, "\n");
}

export type ContentPageFrontmatter = {
  slug: string;
  title: string;
  description: string;
  keywords?: string;
  ogImage?: string;
};

export type ContentPage = {
  frontmatter: ContentPageFrontmatter;
  html: string;
};

// about.md's only build-time substitution today: {publishedEvents}, {eventCountries}, etc.
// A generic {token} replace rather than a templating engine, since this is the one page that
// needs it and the alternative (a real template library) is more machinery than one page's one
// paragraph justifies.
async function interpolateStats(markdown: string): Promise<string> {
  if (!markdown.includes("{publishedEvents}")) return markdown;
  const stats = await getSiteStats();
  return markdown.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = stats[key as keyof typeof stats];
    return value !== undefined ? String(value) : match;
  });
}

// Editorial-only asides ("[BUILD NOTE: ...]", "[JAN: ...]") that must never render on the public
// page -- strip any bracketed paragraph before parsing, not just the ones resolved so far.
function stripEditorialNotes(markdown: string): string {
  return markdown.replace(/^\[(BUILD NOTE|JAN):[\s\S]*?\]\n?/gm, "");
}

export async function getContentPage(slug: string): Promise<ContentPage | null> {
  try {
    const raw = await readContentFile(slug);
    const { data, content } = matter(raw);
    const cleaned = stripEditorialNotes(content);
    const interpolated = await interpolateStats(cleaned);
    const html = await marked.parse(interpolated);
    return { frontmatter: data as ContentPageFrontmatter, html };
  } catch {
    return null;
  }
}

export type FaqEntry = { question: string; answer: string };

// FAQPage JSON-LD needs plain-text Q&A pairs, not rendered HTML. Per faq.md's own build note:
// only the "## Frequently asked questions" section's **Q?** / answer pairs go into the schema --
// the "How It Works" intro above it, and the channel table inside that intro, are not a Q&A and
// must not be forced into one.
export async function getFaqEntries(): Promise<FaqEntry[]> {
  const raw = await readContentFile("faq");
  const { content } = matter(raw);

  const faqSection = content.split(/^# Frequently asked questions$/m)[1];
  if (!faqSection) return [];

  // Strip the trailing "---" section rule and HTML build-notes comment, and the "## Category"
  // subheadings, then split into **Question** / answer-paragraph pairs.
  const body = faqSection.split(/^---$/m)[0];
  const entries: FaqEntry[] = [];
  const blocks = body.split(/\n\*\*(.+?)\*\*\n/).slice(1);
  for (let i = 0; i < blocks.length; i += 2) {
    const question = blocks[i].trim();
    const answer = stripMarkdown((blocks[i + 1] ?? "").split(/\n##\s/)[0]);
    if (question && answer) entries.push({ question, answer });
  }
  return entries;
}
