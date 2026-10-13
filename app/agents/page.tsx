import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getContentPage } from "@/lib/content-pages";
import { SITE_OG_IMAGE, SITE_URL } from "@/lib/site";

// I-141 Stage A: explains the public MCP server (app/api/mcp/route.ts) to people and to agents
// browsing the site. Same shell as /about: words live in content/pages/agents.md.
export const revalidate = false;

export async function generateMetadata(): Promise<Metadata> {
  const page = await getContentPage("agents");
  if (!page) return {};
  const { frontmatter } = page;
  const title = `${frontmatter.title} — CI Treasure Hunt`;
  return {
    title,
    description: frontmatter.description,
    keywords: frontmatter.keywords,
    alternates: { canonical: `${SITE_URL}/agents` },
    openGraph: {
      title: frontmatter.title,
      description: frontmatter.description,
      url: `${SITE_URL}/agents`,
      type: "website",
      images: frontmatter.ogImage ? [`${SITE_URL}${frontmatter.ogImage}`] : [SITE_OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title: frontmatter.title,
      description: frontmatter.description,
    },
  };
}

export default async function AgentsPage() {
  const page = await getContentPage("agents");
  if (!page) notFound();

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-5 py-14 sm:px-8">
      <article
        className="prose prose-slate max-w-none prose-headings:font-serif prose-h1:text-4xl prose-a:text-(--color-pine) prose-a:no-underline hover:prose-a:underline"
        dangerouslySetInnerHTML={{ __html: page.html }}
      />
    </main>
  );
}
