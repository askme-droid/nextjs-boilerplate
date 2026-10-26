import { NextResponse } from "next/server";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { listingImages, listings } from "@/lib/db/schema";
import { embedImage, IMAGE_SEARCH_ENABLED } from "@/lib/listings/embeddings";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const MAX_RESULTS = 24;

/**
 * "Search by image" (see app/components/image-search-button.tsx): embeds the
 * uploaded photo with the same CLIP model used to index listing images (see
 * lib/listings/embeddings.ts), then ranks published listings by their
 * closest image match by cosine distance (worked out here: D1 has no vector
 * search, and the directory has only a few hundred images). Returns listing ids only,
 * best match first — the home page re-fetches full listing data for them
 * (see getListingsByIds in lib/listings/queries.ts) and renders the normal
 * listing card.
 */
export async function POST(request: Request) {
  // Turned off on Cloudflare Workers — see lib/listings/embeddings.ts.
  if (!IMAGE_SEARCH_ENABLED) {
    return NextResponse.json({ error: "Search by image is not available right now." }, { status: 404 });
  }

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
  const rows = await db
    .select({ listingId: listingImages.listingId, embedding: listingImages.embedding })
    .from(listingImages)
    .innerJoin(listings, eq(listings.id, listingImages.listingId))
    .where(and(eq(listings.status, "published"), isNotNull(listingImages.embedding)));

  const best = new Map<string, number>();
  for (const row of rows) {
    if (!row.embedding) continue;
    const d = cosineDistance(row.embedding, embedding);
    const prev = best.get(row.listingId);
    if (prev === undefined || d < prev) best.set(row.listingId, d);
  }
  const ids = [...best.entries()]
    .sort((a, b) => a[1] - b[1])
    .slice(0, MAX_RESULTS)
    .map(([id]) => id);

  return NextResponse.json({ ids });
}

function cosineDistance(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? 1 - dot / Math.sqrt(na * nb) : 1;
}
