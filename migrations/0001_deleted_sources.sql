CREATE TABLE IF NOT EXISTS `deleted_sources` (
	`source_url` text PRIMARY KEY NOT NULL,
	`title` text,
	`deleted_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
