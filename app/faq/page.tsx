import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getContentPage, getFaqEntries } from "@/lib/content-pages";
import { SITE_OG_IMAGE, SITE_URL } from "@/lib/site";

// I-156: content lives in content/pages/faq.md. See that file's own build notes for why only
// the "Frequently asked questions" Q&A blocks (not the "How It Works" intro above them) go into
// the FAQPage schema below.
export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const page = await getContentPage("faq");
  if (!page) return {};
  const { frontmatter } = page;
  const title = `${frontmatter.title} — CI Treasure Hunt`;
  return {
    title,
    description: frontmatter.description,
    keywords: frontmatter.keywords,
    alternates: { canonical: `${SITE_URL}/faq` },
    openGraph: {
      title: frontmatter.title,
      description: frontmatter.description,
      url: `${SITE_URL}/faq`,
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

export default async function FaqPage() {
  const [page, faqEntries] = await Promise.all([getContentPage("faq"), getFaqEntries()]);
  if (!page) notFound();

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqEntries.map((entry) => ({
      "@type": "Question",
      name: entry.question,
      acceptedAnswer: { "@type": "Answer", text: entry.answer },
    })),
  };

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-5 py-14 sm:px-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd).replace(/</g, "\\u003c") }}
      />
      <article
        className="prose prose-slate max-w-none prose-headings:font-serif prose-h1:text-4xl prose-a:text-(--color-pine) prose-a:no-underline hover:prose-a:underline"
        dangerouslySetInnerHTML={{ __html: page.html }}
      />
    </main>
  );
}
