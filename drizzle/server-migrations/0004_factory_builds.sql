-- Written by scripts/generate-migration.mjs from drizzle/schema.ts. Rerun it; do not edit.
-- New: project_builds
CREATE TABLE `project_builds` ( `id` text PRIMARY KEY NOT NULL, `project_id` text NOT NULL, `repository_id` text NOT NULL, `ref` text NOT NULL, `sha` text NOT NULL, `state` text NOT NULL, `destination` text NOT NULL, `sandbox` text, `log` text DEFAULT '' NOT NULL, `digest` text, `preview_url` text, `app_revision` integer, `published_version` integer, `started_at` text, `created_at` text NOT NULL, FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`repository_id`) REFERENCES `project_repositories`(`id`) ON UPDATE no action ON DELETE cascade );
--> statement-breakpoint
CREATE INDEX `project_builds_project` ON `project_builds` (`project_id`,`created_at`);
