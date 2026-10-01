import { NextResponse } from "next/server";
import { and, cosineDistance, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { listingImages, listings } from "@/lib/db/schema";
import { embedImage } from "@/lib/listings/embeddings";

// Needs full Node APIs (sharp, onnxruntime-node) — not available on the Edge
// runtime.
export const runtime = "nodejs";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const MAX_RESULTS = 24;

/**
 * "Search by image" (see app/components/image-search-button.tsx): embeds the
 * uploaded photo with the same CLIP model used to index listing images (see
 * lib/listings/embeddings.ts), then ranks published listings by their
 * closest image match via pgvector cosine distance. Returns listing ids only,
 * best match first — the home page re-fetches full listing data for them
 * (see getListingsByIds in lib/listings/queries.ts) and renders the normal
 * listing card.
 */
export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Choose an image to search with." }, { status: 400 });
  }
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Image must be PNG, JPEG, WebP, or GIF." }, { status: 400 });
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "Image must be under 5MB." }, { status: 400 });
  }

  const embedding = await embedImage(Buffer.from(await file.arrayBuffer()));
  if (!embedding) {
    return NextResponse.json({ error: "Could not process that image — try a different one." }, { status: 422 });
  }

  // One listing can have several images; rank it by its single best match
  // rather than once per matching image.
  const distance = cosineDistance(listingImages.embedding, embedding);
  const rows = await db
    .select({ listingId: listingImages.listingId, distance: sql<number>`min(${distance})` })
    .from(listingImages)
    .innerJoin(listings, eq(listings.id, listingImages.listingId))
    .where(and(eq(listings.status, "published"), isNotNull(listingImages.embedding)))
    .groupBy(listingImages.listingId)
    .orderBy(sql`min(${distance})`)
    .limit(MAX_RESULTS);

  return NextResponse.json({ ids: rows.map((r) => r.listingId) });
}
