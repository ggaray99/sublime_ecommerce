import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server for the Docker image (see Dockerfile).
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
  images: {
    // AVIF first (about 20–30 % smaller than WebP); generated once and cached by the server.
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 2678400,
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
    // src/proxy.ts runs on every page, /admin included, and Next.js truncates proxied
    // request bodies above this size (10 MB by default): keep it at the Server Action limit.
    proxyClientMaxBodySize: "16mb",
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
