import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server for the Docker image (see Dockerfile).
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
  images: {
    // Uploaded photos are served from /media/* (local). Photos uploaded while the
    // staging site ran on Vercel stay in Vercel Blob until they are re-uploaded.
    remotePatterns: [{ protocol: "https", hostname: "*.public.blob.vercel-storage.com", pathname: "/**" }],
  },
  experimental: {
    serverActions: {
      // Uploads go through Server Actions. On the VPS there is no 4.5 MB platform cap:
      // Custom Lab originals can reach 15 MB (each upload validator keeps its own limit).
      bodySizeLimit: "16mb",
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
