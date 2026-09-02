import type { Metadata, Viewport } from "next";
import Link from "next/link";
import Script from "next/script";
import { Coffee, Mail } from "lucide-react";
import { Fraunces, Manrope } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

import "./globals.css";
import NavigationTracker from "@/components/navigation-tracker";
import ServiceWorkerRegistration from "@/components/service-worker-registration";
import { SiteHeader } from "@/components/site-header";
import { getAllCountrySummaries } from "@/lib/country-pages";
import { getCountryLabelWithArticle } from "@/lib/event-display";
import { EVENT_TYPE_PAGES } from "@/lib/event-type-pages";
import {
  FACEBOOK_URL,
  INSTAGRAM_URL,
  SITE_URL,
  TELEGRAM_URL,
} from "@/lib/site";

// I-132 Step 3: sitewide internal-linking band, one "Contact Improvisation in {country}" link per
// live country page. Anchor text deliberately matches each country page's own <title>/H1 verbatim
// (not a bare country name) — anchor text is a real relevance signal, and this reinforces it
// instead of wasting it. Shown on every page including country pages themselves: that doubles up
// with the in-page "Explore other countries" chip section on app/[slug]/page.tsx, which is a
// deliberate keep-both call (2026-08-13) rather than an oversight — the two differ in styling and
// job, and suppressing one per-route would cost more than the duplication does.
// revalidate is required here because the layout itself now fetches; 1h matches every other page.
export const revalidate = 3600;

const sans = Manrope({
  variable: "--font-sans",
  subsets: ["latin"],
});

const serif = Fraunces({
  variable: "--font-serif",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "CI Treasure Hunt",
  description: "A living map of contact improvisation events, communities, teachers & venues worldwide.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "CI Treasure Hunt",
  },
  openGraph: {
    title: "CI Treasure Hunt",
    description: "A living map of contact improvisation events, communities, teachers & venues worldwide.",
    url: SITE_URL,
    siteName: "CI Treasure Hunt",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    // app/opengraph-image.jpg (site-default) applies automatically to any
    // page that doesn't set its own openGraph.images.
    card: "summary_large_image",
    title: "CI Treasure Hunt",
    description: "A living map of contact improvisation events, communities, teachers & venues worldwide.",
  },
};

export const viewport: Viewport = {
  themeColor: "#faf8fd",
};

// Site-wide identity for search engines - who runs this, what to call it, which
// social profiles are the same entity (sameAs). Same escaped-JSON-LD pattern as
// the Event/Place/Person blocks on entity detail pages.
const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "CI Treasure Hunt",
  url: SITE_URL,
  logo: `${SITE_URL}/icon.png`,
  email: "hello@citreasurehunt.com",
  sameAs: [TELEGRAM_URL, FACEBOOK_URL, INSTAGRAM_URL],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const countryLinks = (await getAllCountrySummaries()).sort((a, b) => a.label.localeCompare(b.label));

  return (
    <html lang="en">
      {/* Half the homepage/entity-page images load from this origin — preconnecting lets the
          browser open the connection (DNS + TCP + TLS) ahead of the first actual image request
          instead of discovering it mid-render. Flagged by PageSpeed Insights (I-136). Rendered
          as a plain child, not wrapped in a manual <head>: React 19 auto-hoists <link>/<meta>
          tags into <head> wherever they appear in the tree, and an explicit <head> element here
          conflicts with Next's own head management and gets silently dropped (verified — the
          wrapped version never appeared in rendered output). */}
      <link rel="preconnect" href="https://ormttcjjsumbmvyennfx.supabase.co" />
      <body className={`${sans.variable} ${serif.variable} antialiased`}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd).replace(/</g, "\\u003c") }}
        />
        <NavigationTracker />
        <ServiceWorkerRegistration />
        <div className="min-h-screen">
          <SiteHeader />
          {children}
          {/* I-167: separate from the country strip below on purpose, same reasoning as that
              strip's own separation from the footer — this exists purely for crawl-and-link-equity
              distribution to the type pages, appearing on every page, not a navigation menu. */}
          <nav aria-label="Contact Improvisation events by type" className="border-t border-slate-200 bg-slate-50 px-5 py-4 text-center sm:px-8 lg:px-10">
            <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-slate-500">
              <span className="mr-2 font-medium text-slate-600">Browse by type:</span>
              {EVENT_TYPE_PAGES.map((t, i) => (
                <span key={t.type}>
                  {i > 0 && <span className="mr-2 text-slate-300">|</span>}
                  <Link href={t.path} className="hover:text-slate-800 hover:underline">
                    {t.label}
                  </Link>
                </span>
              ))}
            </div>
          </nav>
          {countryLinks.length > 0 && (
            <nav aria-label="Contact Improvisation by country" className="border-t border-slate-200 bg-slate-50 px-5 py-4 text-center sm:px-8 lg:px-10">
              <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-slate-500">
                <span className="mr-2">
                  <Link href="/countries" className="font-medium text-slate-600 hover:text-slate-800 hover:underline">
                    Contact Improvisation Worldwide:
                  </Link>
                </span>
                {countryLinks.map((c, i) => (
                  <span key={c.iso}>
                    {i > 0 && <span className="mr-2 text-slate-300">|</span>}
                    <Link href={`/${c.slug}`} className="hover:text-slate-800 hover:underline">
                      Contact Improvisation in {getCountryLabelWithArticle(c.iso)}
                    </Link>
                  </span>
                ))}
              </div>
            </nav>
          )}
          <footer className="border-t border-slate-200 bg-white">
            <div className="mx-auto flex w-full max-w-7xl flex-col items-center gap-6 px-5 py-8 text-sm text-slate-700 sm:px-8 lg:grid lg:grid-cols-3 lg:items-center lg:px-10">
              <div className="flex flex-col items-center gap-4 lg:items-start">
                <p className="font-serif text-2xl text-slate-950">CI Treasure Hunt</p>
                <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 lg:justify-start">
                  <Link href="/imprint">Imprint</Link>
                  <Link href="/privacy">Privacy</Link>
                  <Link href="/terms">Terms</Link>
                </div>
              </div>
              <div className="flex flex-col items-center gap-2 text-center">
                <a
                  href="https://buymeacoffee.com/citreasurehunt"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full bg-yellow-50 px-3 py-1.5 text-xs font-medium text-yellow-700 transition hover:bg-yellow-100"
                >
                  <Coffee className="size-3.5" />
                  Support my work ❤️
                </a>
                <p className="text-slate-500">
                  <a href="mailto:hello@citreasurehunt.com" className="transition hover:text-slate-800">
                    hello@citreasurehunt.com
                  </a>
                  {" · "}
                  <Link href="/feedback" className="transition hover:text-slate-800">
                    Feedback
                  </Link>
                </p>
              </div>
              <div className="flex items-center gap-3 lg:justify-end">
                <a
                  href={TELEGRAM_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex size-10 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200"
                  aria-label="Telegram group"
                  title="Telegram group"
                >
                  <TelegramIcon className="size-5" />
                </a>
                <Link
                  href="/newsletter"
                  className="inline-flex size-10 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200"
                  aria-label="Newsletter"
                  title="Newsletter"
                >
                  <Mail className="size-5" />
                </Link>
                <a
                  href={INSTAGRAM_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex size-10 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200"
                  aria-label="Instagram"
                  title="Instagram"
                >
                  <InstagramIcon className="size-5" />
                </a>
                <a
                  href={FACEBOOK_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex size-10 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200"
                  aria-label="Facebook page"
                  title="Facebook page"
                >
                  <FacebookIcon className="size-5" />
                </a>
              </div>
            </div>
          </footer>
        </div>
        <Analytics />
        <SpeedInsights />
        {/* I-121: self-hosted Umami, proxied through /stats/* (vercel.json rewrite to the
            ci-treasure-analytics Vercel project) so the request looks first-party and isn't
            caught by ad-blocker filter lists targeting obvious analytics subdomains. Running
            alongside @vercel/analytics for a short overlap window to cross-check numbers before
            deciding on cutover — see docs/issues/i-121-umami-analytics.md. */}
        <Script
          defer
          src="/stats/script.js"
          data-website-id="962ed0a9-d211-4e03-9a5a-5d623a4375a4"
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}

function TelegramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M21.9 4.6 18.6 20c-.2 1.1-.8 1.4-1.7.9l-5.1-3.8-2.5 2.4c-.3.3-.5.5-1 .5l.4-5.2 9.5-8.6c.4-.4-.1-.6-.6-.2L5.8 13.4.7 11.8c-1.1-.3-1.1-1.1.2-1.6L20.8 2.5c.9-.3 1.7.2 1.1 2.1Z" />
    </svg>
  );
}

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M7.8 2h8.4A5.8 5.8 0 0 1 22 7.8v8.4a5.8 5.8 0 0 1-5.8 5.8H7.8A5.8 5.8 0 0 1 2 16.2V7.8A5.8 5.8 0 0 1 7.8 2Zm-.2 2A3.6 3.6 0 0 0 4 7.6v8.8A3.6 3.6 0 0 0 7.6 20h8.8a3.6 3.6 0 0 0 3.6-3.6V7.6A3.6 3.6 0 0 0 16.4 4H7.6Zm9.6 1.7a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2ZM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z" />
    </svg>
  );
}

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M14.1 8.3V6.6c0-.8.5-1 1-1h1.7V2.2C16.5 2.1 15.4 2 14.2 2c-2.7 0-4.5 1.6-4.5 4.6v1.7h-3v3.8h3V22h4.1v-9.9h3l.5-3.8h-3.2Z" />
    </svg>
  );
}
