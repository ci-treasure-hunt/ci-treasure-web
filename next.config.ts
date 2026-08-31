import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // sharp ships a native binary; Turbopack's server bundling was failing to load it at
  // runtime (ERR_DLOPEN_FAILED on libvips) since 2026-08-25, breaking event-image upload,
  // profile-photo upload, and pasted-URL image rehosting. Excluding it from bundling makes
  // Next.js require() it straight from node_modules at runtime instead.
  serverExternalPackages: ["sharp"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "ormttcjjsumbmvyennfx.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  // I-166 F1. Before this the site sent no security headers at all beyond the HSTS Vercel adds
  // by itself. Deliberately the four that carry no behavioural risk; a full Content-Security-Policy
  // is a separate decision (see docs/issues/i-166-security-audit-3.md) because restricting script
  // sources under the App Router needs per-request nonces, which would opt every page out of the
  // static/ISR rendering this site's performance work depends on.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // The one with a real attack path: without it any site can load ours in a hidden iframe
          // and position it so an admin's click lands on Approve or Trust organizer while they
          // think they're clicking something else. frame-ancestors is the modern equivalent and
          // is the only CSP directive here — it needs no nonces, so it costs nothing.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          // Stop the browser second-guessing a declared content type. We serve user-supplied
          // images, so a file being re-interpreted as HTML is the case this prevents.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Event pages link out to organizer sites constantly; send the origin rather than the
          // full URL so third parties don't learn which specific page someone came from.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Switch off device APIs the site never uses.
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
        ],
      },
    ];
  },
  async redirects() {
    return [
      // I-132: country pages live at the root (/sweden), not nested, but /countries exists as
      // their index — which invites guessing /countries/sweden. Resolve that guess instead of
      // 404ing it. Permanent so search engines consolidate on the canonical root-level URL.
      {
        source: "/countries/:slug",
        destination: "/:slug",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
