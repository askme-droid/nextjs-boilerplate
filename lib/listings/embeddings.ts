import "server-only";

/**
 * Image embeddings for "search by image" are TURNED OFF while the site runs
 * on Cloudflare Workers.
 *
 * The feature used CLIP ViT-B/32 through transformers.js + onnxruntime-node,
 * a native Node module that Cloudflare Workers cannot load on any plan. The
 * full implementation is in git history (before the move to Cloudflare); to
 * bring it back it has to run somewhere with real Node (e.g. a small separate
 * service) that this module calls instead.
 *
 * Existing vectors in listing_images.embedding are left untouched, so a
 * re-enabled service using the same model can use them straight away.
 *
 * Every call site already treats an embedding as best-effort (null = skip),
 * so returning null here simply stops new images from being indexed.
 */
export const IMAGE_SEARCH_ENABLED = false;

export async function embedImage(_bytes: Buffer | ArrayBuffer): Promise<number[] | null> {
  return null;
}

export async function embedImageUrl(_url: string): Promise<number[] | null> {
  return null;
}
