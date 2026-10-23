import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  images: {
    // Product and category photos uploaded from /admin live in Vercel Blob (public store).
    remotePatterns: [{ protocol: "https", hostname: "*.public.blob.vercel-storage.com", pathname: "/**" }],
  },
  experimental: {
    serverActions: {
      // Image uploads go through Server Actions: 4 MB per image plus form overhead.
      // Vercel Functions accept request bodies up to 4.5 MB.
      bodySizeLimit: "4.4mb",
    },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
