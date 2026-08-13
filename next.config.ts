import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
