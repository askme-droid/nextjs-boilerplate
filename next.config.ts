import type { NextConfig } from "next";

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
};

export default nextConfig;
