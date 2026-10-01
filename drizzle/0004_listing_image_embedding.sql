CREATE EXTENSION IF NOT EXISTS vector;
ALTER TABLE "listing_images" ADD COLUMN "embedding" vector(512);
CREATE INDEX IF NOT EXISTS "listing_images_embedding_idx" ON "listing_images" USING hnsw ("embedding" vector_cosine_ops);