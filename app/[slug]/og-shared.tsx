import { ImageResponse } from "next/og";

import { getCountryPageData } from "@/lib/country-pages";
import { getCountryLabelWithArticle } from "@/lib/event-display";
import { getCountryFlag } from "@/lib/utils";

export const size = { width: 1200, height: 630 };

// Next's opengraph-image/twitter-image file convention only supports a static `alt` export (no
// params access, confirmed against the docs) — can't say "Sweden" vs "Greece" here. Still needs
// to be genuinely descriptive text, not a placeholder: this is what was missing entirely before
// (no og:image:alt/twitter:image:alt tag at all), which is what a crawler like Bing flags.
export const alt = "A Contact Improvisation country guide on CI Treasure Hunt — communities, teachers, upcoming events, and venues";

// Same recipe Vercel's own OG-image examples use: requesting Google's css2 endpoint with a
// `text=` param (rather than no param, or a UA-sniffed woff2 request) reliably returns a single
// `@font-face` block in `format('truetype')` — the one format satori/ImageResponse can consume.
// Fetching the whole alphabet once (not just this page's exact title) keeps this reusable across
// every country's differently-spelled name without recomputing a subset per slug.
async function loadFraunces(weight: 400 | 600) {
  const text = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz ·0123456789";
  const css = await (
    await fetch(`https://fonts.googleapis.com/css2?family=Fraunces:wght@${weight}&text=${encodeURIComponent(text)}`)
  ).text();
  const match = css.match(/src: url\(([^)]+)\) format\('(?:opentype|truetype)'\)/);
  if (!match) throw new Error("Failed to resolve Fraunces font asset for OG image");
  const fontRes = await fetch(match[1]);
  return fontRes.arrayBuffer();
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

// Shared by opengraph-image.tsx and twitter-image.tsx — both platforms want the same 1200x630
// visual, generated from the same country data, so there's one place to keep the design in sync
// rather than drifting between two near-duplicate files.
export async function renderCountryOgImage(slug: string) {
  const country = await getCountryPageData(slug);
  const label = country ? getCountryLabelWithArticle(country.iso) : slug;
  const flag = country ? getCountryFlag(country.iso) : "";

  const communityCount = (country?.communities.length ?? 0) + (country?.nationalCommunities.length ?? 0);
  // Same order as the page's own stat strip (app/[slug]/page.tsx): communities, teachers,
  // upcoming events, venues — kept in sync deliberately, not just an arbitrary list order.
  const stats = [
    communityCount > 0 ? pluralize(communityCount, "community", "communities") : null,
    country && country.teachers.length > 0 ? pluralize(country.teachers.length, "teacher") : null,
    country && country.events.length > 0 ? pluralize(country.events.length, "upcoming event") : null,
    country && country.venues.length > 0 ? pluralize(country.venues.length, "venue") : null,
  ].filter((s): s is string => Boolean(s));

  const fraunces = await loadFraunces(600);

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px",
          backgroundImage: "linear-gradient(135deg, #1e0c30 0%, #341a5c 45%, #472278 75%, #6834b2 100%)",
          position: "relative",
        }}
      >
        {/* Corner glow — echoes the D-02 generic hero gradient's "muted pine" mid-stop used on
            venue/teacher detail headers, so this image reads as the same design family. */}
        <div
          style={{
            position: "absolute",
            top: -120,
            right: -120,
            width: 560,
            height: 560,
            borderRadius: "50%",
            backgroundImage: "radial-gradient(circle, rgba(104,52,178,0.65) 0%, rgba(104,52,178,0) 70%)",
            display: "flex",
          }}
        />

        {flag && <div style={{ fontSize: 92, display: "flex" }}>{flag}</div>}

        <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
          <div
            style={{
              fontFamily: "Fraunces",
              fontWeight: 600,
              fontSize: 62,
              lineHeight: 1.15,
              color: "#ffffff",
              display: "flex",
              maxWidth: 980,
            }}
          >
            Contact Improvisation in {label}
          </div>
          {stats.length > 0 && (
            <div style={{ display: "flex", fontSize: 30, color: "#e2d5f0" }}>
              {stats.join("   ·   ")}
            </div>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <div style={{ fontFamily: "Fraunces", fontSize: 26, color: "rgba(255,255,255,0.55)", display: "flex" }}>
            CI Treasure Hunt
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [{ name: "Fraunces", data: fraunces, style: "normal", weight: 600 }],
      // Regional-indicator flag emoji render as blank boxes in satori's default renderer without
      // this — twemoji is the CDN set ImageResponse fetches glyphs from when this is set.
      emoji: "twemoji",
    },
  );
}
