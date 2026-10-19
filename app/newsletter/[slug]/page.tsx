import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { formatSentDate, getIssue, getIssueSlugs } from "@/lib/newsletter-issues";
import { SITE_OG_IMAGE, SITE_URL } from "@/lib/site";
import { NewsletterForm } from "../newsletter-form";

// Same as the guides (I-172): the content is markdown in content/, so it only changes with a
// deploy, and a deploy rebuilds it anyway.
export const revalidate = false;

export async function generateStaticParams() {
  const slugs = await getIssueSlugs();
  return slugs.map((slug) => ({ slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const issue = await getIssue(slug);
  if (!issue) return {};
  const { frontmatter } = issue;
  const url = `${SITE_URL}/newsletter/${slug}`;
  const image = frontmatter.image ? `${SITE_URL}${frontmatter.image}` : SITE_OG_IMAGE;

  return {
    title: `${frontmatter.title} — CI Treasure Hunt Newsletter`,
    description: frontmatter.description,
    alternates: { canonical: url },
    openGraph: {
      title: frontmatter.title,
      description: frontmatter.description,
      url,
      siteName: "CI Treasure Hunt",
      type: "article",
      publishedTime: frontmatter.sent,
      images: [{ url: image, width: frontmatter.imageWidth, height: frontmatter.imageHeight }],
    },
    twitter: {
      card: "summary_large_image",
      title: frontmatter.title,
      description: frontmatter.description,
      images: [image],
    },
  };
}

export default async function NewsletterIssuePage({ params }: Props) {
  const { slug } = await params;
  const issue = await getIssue(slug);
  if (!issue) notFound();

  const { frontmatter, html } = issue;
  const url = `${SITE_URL}/newsletter/${slug}`;

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: frontmatter.title,
    description: frontmatter.description,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    datePublished: frontmatter.sent,
    author: { "@type": "Person", name: "Jan" },
    publisher: { "@type": "Organization", name: "CI Treasure Hunt", url: SITE_URL },
    image: frontmatter.image ? `${SITE_URL}${frontmatter.image}` : SITE_OG_IMAGE,
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Newsletter", item: `${SITE_URL}/newsletter` },
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
          <Link href="/newsletter" className="hover:text-slate-800 hover:underline">
            Newsletter
          </Link>
        </nav>

        {frontmatter.eyebrow && <p className="mb-2 text-base text-slate-500">{frontmatter.eyebrow}</p>}
        <h1 className="mb-4 font-serif text-4xl tracking-tight text-slate-950 sm:text-5xl">{frontmatter.title}</h1>

        <div className="mb-8 border-b border-(--color-sand-strong) pb-6 text-sm text-slate-500">
          <span>Newsletter</span>
          <span className="mx-2 text-slate-300">·</span>
          <span>
            Sent <time dateTime={frontmatter.sent}>{formatSentDate(frontmatter.sent)}</time>
          </span>
        </div>

        {frontmatter.image && (
          // Raw <img> on purpose, like the rest of the site: no Vercel Image Optimization quota.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={frontmatter.image}
            alt={frontmatter.imageAlt ?? ""}
            width={frontmatter.imageWidth}
            height={frontmatter.imageHeight}
            className="mb-8 h-auto w-full rounded-xl border border-slate-200"
          />
        )}

        <article
          className="prose prose-slate max-w-none prose-headings:font-serif prose-h2:mt-10 prose-a:text-(--color-pine) prose-a:no-underline hover:prose-a:underline"
          dangerouslySetInnerHTML={{ __html: html }}
        />

        <div className="mt-12 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-1 font-serif text-xl text-slate-950">Get the next issue in your inbox</h2>
          <p className="mb-4 text-sm text-slate-500">
            A monthly digest of upcoming events, new communities, and what&apos;s moving in the CI world.
          </p>
          <NewsletterForm />
          <p className="mt-4 text-xs text-slate-400">
            You will get one email to confirm, then the newsletter.{" "}
            <Link href="/privacy" className="underline hover:text-slate-600">
              Privacy policy
            </Link>
            . Unsubscribe any time.
          </p>
        </div>

        <p className="mt-8 text-sm">
          <Link href="/newsletter" className="text-(--color-pine) hover:underline">
            ← All issues
          </Link>
        </p>
      </div>
    </main>
  );
}
