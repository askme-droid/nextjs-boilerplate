import "server-only";
import os from "os";
import path from "path";

/**
 * Image embeddings for "search by image" — CLIP ViT-B/32, run locally via
 * transformers.js (no API key, no per-image cost; see the fdsg-sync.ts-style
 * self-hosted approach). Produces a 512-dim vector matching the
 * `listing_images.embedding` column (see lib/db/schema/listings.ts and
 * drizzle/0004_listing_image_embedding.sql), compared with pgvector's cosine
 * distance.
 *
 * The model + processor are loaded once per server process and reused — cheap
 * on a long-lived server, but on a serverless platform each cold start pays
 * the load cost again (a few seconds). That's an accepted trade-off for
 * avoiding a paid embeddings API.
 */

const MODEL_ID = "Xenova/clip-vit-base-patch32";

// transformers.js defaults its cache dir to inside node_modules, which is
// read-only on Vercel's deployed functions — point it at the OS temp dir
// (Vercel's /tmp is writable) so the model can actually download on first use.
async function configureEnv() {
  const { env } = await import("@xenova/transformers");
  env.cacheDir = path.join(os.tmpdir(), "transformers-cache");
}

let pipelinePromise: Promise<{
  processor: import("@xenova/transformers").Processor;
  model: import("@xenova/transformers").PreTrainedModel;
}> | null = null;

async function loadPipeline() {
  if (!pipelinePromise) {
    pipelinePromise = (async () => {
      await configureEnv();
      const { AutoProcessor, CLIPVisionModelWithProjection } = await import("@xenova/transformers");
      const [processor, model] = await Promise.all([
        AutoProcessor.from_pretrained(MODEL_ID),
        CLIPVisionModelWithProjection.from_pretrained(MODEL_ID, { quantized: true }),
      ]);
      return { processor, model };
    })();
  }
  return pipelinePromise;
}

/** Embeds raw image bytes into a 512-dim CLIP vector, or `null` if the bytes
 *  aren't a decodable image (never throws — every call site treats an
 *  embedding as a best-effort enrichment, not something that can fail a
 *  listing save or a sync run). */
export async function embedImage(bytes: Buffer | ArrayBuffer): Promise<number[] | null> {
  try {
    const { RawImage } = await import("@xenova/transformers");
    const { processor, model } = await loadPipeline();

    const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
    // .slice() (not .subarray()) forces a fresh, plain ArrayBuffer backing —
    // sidesteps a Buffer<ArrayBufferLike> vs. BlobPart generic mismatch.
    const blob = new Blob([new Uint8Array(buf).slice()]);
    const image = await RawImage.fromBlob(blob);
    const inputs = await processor(image);
    const { image_embeds } = await model(inputs);
    return Array.from(image_embeds.data as Float32Array);
  } catch (e) {
    console.error("embedImage failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

/** Fetches an image URL and embeds it — for hotlinked images (fd.sg sync, the
 *  URL-only addImage action) where we don't already have the bytes in hand. */
export async function embedImageUrl(url: string): Promise<number[] | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await embedImage(await res.arrayBuffer());
  } catch (e) {
    console.error(`embedImageUrl failed for ${url}:`, e instanceof Error ? e.message : e);
    return null;
  }
}
