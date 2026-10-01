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
  // These ship native/binary assets (onnxruntime-node's .node bindings,
  // sharp's prebuilt libvips) that webpack can't bundle — see
  // lib/listings/embeddings.ts. Left external, Next requires them from
  // node_modules at runtime instead of trying to pack them in.
  serverExternalPackages: ["@xenova/transformers", "sharp", "onnxruntime-node"],
};

export default nextConfig;
