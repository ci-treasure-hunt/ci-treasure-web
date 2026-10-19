import { readdir, readFile } from "fs/promises";
import path from "path";
import matter from "gray-matter";
import { marked } from "marked";

// I-182: sent newsletter issues, one markdown file per issue in content/newsletter/. Slug = file
// name: the first issue of a month is YYYY-MM, any further issue that month is YYYY-MM-DD (its send
// date). A slug never changes after publishing, because shared links point at it; when a month gets
// a second issue, only the label on /newsletter switches to full dates (issueLabel). Rendered at
// /newsletter/[slug] and listed on /newsletter, so every issue gets a shareable link on our own
// domain rather than only an EmailOctopus web version. The text is what was actually sent, with only dead links repointed (and a note saying
// so). The send log and the private archive live in ci-treasure-hunt/content/newsletters/.
const ISSUES_DIR = path.join(process.cwd(), "content", "newsletter");
const SLUG = /^\d{4}-\d{2}(-\d{2})?$/;

export type NewsletterIssueFrontmatter = {
  slug: string;
  title: string;
  description: string;
  sent: string; // YYYY-MM-DD
  eyebrow?: string;
  image?: string;
  imageAlt?: string;
  imageWidth?: number;
  imageHeight?: number;
  // EmailOctopus web version of the same issue. Kept as a record; it carries an EO signature
  // (`s=`), so it cannot be rebuilt from the campaign ID and has to be copied from EO.
  emailUrl?: string;
};

export type NewsletterIssue = {
  frontmatter: NewsletterIssueFrontmatter;
  html: string;
};

export async function getIssueSlugs(): Promise<string[]> {
  try {
    const files = await readdir(ISSUES_DIR);
    return files
      .filter((f) => f.endsWith(".md"))
      .map((f) => f.replace(/\.md$/, ""))
      .filter((s) => SLUG.test(s));
  } catch {
    return [];
  }
}

export async function getIssue(slug: string): Promise<NewsletterIssue | null> {
  // The filename comes from the URL: anything but YYYY-MM or YYYY-MM-DD is not an issue.
  if (!SLUG.test(slug)) return null;
  try {
    // Windows checkouts (core.autocrlf) turn LF into CRLF; normalize at the read boundary, same as
    // lib/content-pages.ts.
    const raw = (await readFile(path.join(ISSUES_DIR, `${slug}.md`), "utf-8")).replace(/\r\n/g, "\n");
    const { data, content } = matter(raw);
    const html = await marked.parse(content);
    return { frontmatter: { ...(data as NewsletterIssueFrontmatter), slug }, html };
  } catch {
    return null;
  }
}

// Newest first, by send date (slugs alone do not sort right once YYYY-MM and YYYY-MM-DD mix).
export async function getAllIssues(): Promise<NewsletterIssue[]> {
  const slugs = await getIssueSlugs();
  const issues = (await Promise.all(slugs.map((s) => getIssue(s)))).filter(
    (i): i is NewsletterIssue => i !== null,
  );
  return issues.sort((a, b) => b.frontmatter.sent.localeCompare(a.frontmatter.sent));
}

// "October 2026", or "October 18, 2026" when that month has more than one issue.
export function issueLabel(issue: NewsletterIssue, all: NewsletterIssue[]): string {
  const month = issue.frontmatter.sent.slice(0, 7);
  const sameMonth = all.filter((i) => i.frontmatter.sent.slice(0, 7) === month).length;
  return sameMonth > 1 ? formatSentDate(issue.frontmatter.sent) : formatIssueMonth(month);
}

function formatIssueMonth(yearMonth: string): string {
  const [year, month] = yearMonth.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatSentDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
