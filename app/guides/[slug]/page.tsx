import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { formatGuideDate, getGuide, getGuideSlugs, guideOgImage } from "@/lib/guides";
import { SITE_URL } from "@/lib/site";

export const revalidate = 3600;

// Files on disk, so the whole set can be rendered at build time. dynamicParams stays on its
// default (true) so a guide added between deploys still resolves rather than 404ing.
export async function generateStaticParams() {
  const slugs = await getGuideSlugs();
  return slugs.map((slug) => ({ slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const guide = await getGuide(slug);
  if (!guide) return {};
  const { frontmatter } = guide;
  const url = `${SITE_URL}/guides/${frontmatter.slug}`;
  const image = guideOgImage(frontmatter);

  return {
    // No brand suffix: every guide title is already at or near the ~60-character SERP limit
    // (see buildEntityTitle's note in lib/site.ts), and the headline matters more here than
    // the brand does.
    title: frontmatter.title,
    description: frontmatter.description,
    keywords: frontmatter.keywords,
    authors: frontmatter.author ? [{ name: frontmatter.author }] : undefined,
    alternates: { canonical: url },
    openGraph: {
      title: frontmatter.title,
      description: frontmatter.description,
      url,
      siteName: "CI Treasure Hunt",
      type: "article",
      publishedTime: frontmatter.published,
      modifiedTime: frontmatter.updated,
      images: [{ url: image, width: 1280, height: 1024, type: "image/jpeg" }],
    },
    twitter: {
      card: "summary_large_image",
      title: frontmatter.title,
      description: frontmatter.description,
      images: [image],
    },
  };
}

export default async function GuidePage({ params }: Props) {
  const { slug } = await params;
  const guide = await getGuide(slug);
  if (!guide) notFound();

  const { frontmatter, heading, html, readingMinutes } = guide;
  const url = `${SITE_URL}/guides/${frontmatter.slug}`;

  // Article, not FAQPage: Google deprecated FAQ rich results for most sites in August 2023, and
  // several of these guides carry question-shaped headings that would otherwise invite marking up
  // a page that is not primarily a Q&A. The question sections still get pulled into People Also
  // Ask and AI answers, which read the prose, not the markup.
  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: frontmatter.title,
    description: frontmatter.description,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    datePublished: frontmatter.published,
    dateModified: frontmatter.updated ?? frontmatter.published,
    author: { "@type": "Person", name: frontmatter.author ?? "CI Treasure Hunt" },
    publisher: {
      "@type": "Organization",
      name: "CI Treasure Hunt",
      url: SITE_URL,
    },
    image: guideOgImage(frontmatter),
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Guides", item: `${SITE_URL}/guides` },
      { "@type": "ListItem", position: 3, name: frontmatter.title, item: url },
    ],
  };

  return (
    <main className="min-h-screen bg-(--color-mist) text-slate-900">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd).replace(/</g, "\\u003c") }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd).replace(/</g, "\\u003c") }}
      />

      <div className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8">
        <nav aria-label="Breadcrumb" className="mb-6 text-sm text-slate-500">
          <Link href="/" className="hover:text-slate-800 hover:underline">
            Home
          </Link>
          <span className="mx-2 text-slate-300">/</span>
          <Link href="/guides" className="hover:text-slate-800 hover:underline">
            Guides
          </Link>
        </nav>

        <h1 className="mb-4 font-serif text-4xl tracking-tight text-slate-950 sm:text-5xl">
          {heading}
        </h1>

        {/* Byline and dates render from frontmatter rather than being hand-written into each
            file's body, so "last updated" can't drift out of sync with the file it describes. */}
        <div className="mb-8 border-b border-(--color-sand-strong) pb-6 text-sm text-slate-500">
          {frontmatter.author && <span>By {frontmatter.author}</span>}
          {frontmatter.updated && (
            <>
              {frontmatter.author && <span className="mx-2 text-slate-300">·</span>}
              <span>
                Updated{" "}
                <time dateTime={frontmatter.updated}>{formatGuideDate(frontmatter.updated)}</time>
              </span>
            </>
          )}
          <span className="mx-2 text-slate-300">·</span>
          <span>{readingMinutes} min read</span>
        </div>

        <article
          className="prose prose-slate max-w-none prose-headings:font-serif prose-h2:mt-10 prose-a:text-(--color-pine) prose-a:no-underline hover:prose-a:underline prose-th:text-left prose-table:block prose-table:overflow-x-auto"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </main>
  );
}
