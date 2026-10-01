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
  // onnxruntime-node's actual inference engine is a native .so loaded via
  // dlopen from Node, not a plain require() — Vercel's file-tracing can't
  // see that dependency by static analysis, so without this the deployed
  // function is missing the file and every embed call fails at runtime with
  // "libonnxruntime.so.1.14.0: cannot open shared object file" (confirmed in
  // production logs). Scoped to the routes that actually touch
  // lib/listings/embeddings.ts, since it's ~16MB added per matched function.
  outputFileTracingIncludes: {
    "/api/search-by-image": ["./node_modules/onnxruntime-node/bin/napi-v3/linux/x64/*"],
    "/admin/listings/**": ["./node_modules/onnxruntime-node/bin/napi-v3/linux/x64/*"],
  },
};

export default nextConfig;
