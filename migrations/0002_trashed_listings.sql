CREATE TABLE IF NOT EXISTS `trashed_listings` (
	`listing_id` text PRIMARY KEY NOT NULL,
	`previous_status` text NOT NULL,
	`trashed_at` integer NOT NULL,
	`trashed_by` text
);
