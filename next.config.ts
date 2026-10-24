import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  experimental: {
    // Default is 1MB — too small for uploading several listing photos in one
    // request. Each file is still capped individually in the upload action
    // (see app/admin/listings/actions.ts); this just raises the combined
    // request ceiling to fit a handful of them.
    serverActions: {
      bodySizeLimit: "20mb",
    },
  },
  images: {
    // Runs on Cloudflare Workers (via OpenNext), where Next's built-in image
    // optimizer isn't available. Listing photos were already unoptimized; this
    // covers the logo and homepage hero images in public/, which are served
    // as-is from Cloudflare's static assets.
    unoptimized: true,
  },
};

export default nextConfig;

// Lets `next dev` read Cloudflare bindings (Hyperdrive, env vars) from
// wrangler.jsonc, so local dev behaves like the deployed Worker.
initOpenNextCloudflareForDev();
