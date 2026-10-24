ALTER TABLE "listings" ADD COLUMN "quick_answer" text;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "faqs" jsonb;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "offer_price" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "offer_discount" text;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "redemption_info" text;