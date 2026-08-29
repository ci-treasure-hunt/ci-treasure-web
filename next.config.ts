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
