import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getContentPage } from "@/lib/content-pages";
import { SITE_OG_IMAGE, SITE_URL } from "@/lib/site";

// I-156: content lives in content/pages/about.md, not here -- see that file's own frontmatter
// for description/keywords and its body for everything editorial. This route is just the shell:
// metadata plumbing + prose styling, kept in code because Jan edits the words in git, not React.
export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const page = await getContentPage("about");
  if (!page) return {};
  const { frontmatter } = page;
  const title = `${frontmatter.title} — CI Treasure Hunt`;
  return {
    title,
    description: frontmatter.description,
    keywords: frontmatter.keywords,
    alternates: { canonical: `${SITE_URL}/about` },
    openGraph: {
      title: frontmatter.title,
      description: frontmatter.description,
      url: `${SITE_URL}/about`,
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

export default async function AboutPage() {
  const page = await getContentPage("about");
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
