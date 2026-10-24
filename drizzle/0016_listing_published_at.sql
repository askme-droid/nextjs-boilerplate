ALTER TABLE "listings" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
UPDATE "listings" SET "published_at" = "created_at" WHERE "status" = 'published' AND "published_at" IS NULL;
