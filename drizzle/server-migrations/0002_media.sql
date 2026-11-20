-- Written by scripts/generate-migration.mjs from drizzle/schema.ts. Rerun it; do not edit.
-- New: media_items
CREATE TABLE `media_items` ( `id` text PRIMARY KEY NOT NULL, `space_id` text NOT NULL, `owner_id` text NOT NULL, `visibility` text DEFAULT 'private' NOT NULL, `r2_key` text NOT NULL, `thumb_r2_key` text, `filename` text NOT NULL, `content_type` text NOT NULL, `size_bytes` integer NOT NULL, `width` integer, `height` integer, `duration_ms` integer, `taken_at` text NOT NULL, `taken_at_source` text NOT NULL, `import_key` text, `created_at` text NOT NULL, FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action, CONSTRAINT "media_items_size_check" CHECK("media_items"."size_bytes" > 0) );
--> statement-breakpoint
CREATE UNIQUE INDEX `media_items_r2_key_unique` ON `media_items` (`r2_key`);
--> statement-breakpoint
CREATE INDEX `media_items_owner_taken_idx` ON `media_items` (`space_id`,`owner_id`,`taken_at`);
--> statement-breakpoint
CREATE INDEX `media_items_visibility_taken_idx` ON `media_items` (`space_id`,`visibility`,`taken_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_items_import_key_idx` ON `media_items` (`owner_id`,`import_key`);
