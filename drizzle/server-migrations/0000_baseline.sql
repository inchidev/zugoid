CREATE TABLE `account_recovery` (
	`user_id` text PRIMARY KEY NOT NULL,
	`code_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `auth_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `account_recovery_code_hash_unique` ON `account_recovery` (`code_hash`);--> statement-breakpoint
CREATE TABLE `agent_code_proposals` (
	`run_id` text PRIMARY KEY NOT NULL,
	`environment_id` text NOT NULL,
	`input_hash` text NOT NULL,
	`branch` text NOT NULL,
	`commit_sha` text,
	`published_commit_sha` text,
	`pull_number` integer,
	`lease_until` text,
	`lease_token` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`environment_id`) REFERENCES `agent_environments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `agent_environments` (
	`id` text PRIMARY KEY NOT NULL,
	`config_json` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`space_id` text DEFAULT '00000000-0000-4000-8000-00000000000d' NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `agent_environments_space_idx` ON `agent_environments` (`space_id`);--> statement-breakpoint
CREATE TABLE `agent_model_calls` (
	`run_id` text NOT NULL,
	`call_number` integer NOT NULL,
	`model` text NOT NULL,
	`status` text NOT NULL,
	`started_at` text NOT NULL,
	`completed_at` text,
	`total_tokens` integer,
	`error` text,
	PRIMARY KEY(`run_id`, `call_number`),
	FOREIGN KEY (`run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `agent_run_deliveries` (
	`run_id` text PRIMARY KEY NOT NULL,
	`task_status` text DEFAULT 'pending' NOT NULL,
	`task_error` text,
	`report_status` text DEFAULT 'pending' NOT NULL,
	`report_error` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `agent_run_events` (
	`run_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`event_json` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`run_id`, `sequence`),
	FOREIGN KEY (`run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `agent_run_publications` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`digest` text NOT NULL,
	`payload_json` text NOT NULL,
	`status` text NOT NULL,
	`message_id` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`decided_at` text,
	`decided_by` text,
	`completed_at` text,
	FOREIGN KEY (`run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`decided_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "agent_run_publications_status_check" CHECK("agent_run_publications"."status" IN ('pending','rejected','expired','executing','completed','uncertain'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_run_publications_message_id_unique` ON `agent_run_publications` (`message_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_run_publication_active` ON `agent_run_publications` (`run_id`) WHERE "agent_run_publications"."status" IN ('pending','executing','completed','uncertain');--> statement-breakpoint
CREATE INDEX `agent_run_publication_history` ON `agent_run_publications` (`run_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `agent_run_tools` (
	`run_id` text NOT NULL,
	`call_id` text NOT NULL,
	`name` text NOT NULL,
	`arguments_json` text NOT NULL,
	`policy_json` text DEFAULT '' NOT NULL,
	`status` text NOT NULL,
	`result_json` text,
	`created_at` text NOT NULL,
	PRIMARY KEY(`run_id`, `call_id`),
	FOREIGN KEY (`run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "agent_run_tools_status_check" CHECK("agent_run_tools"."status" IN ('pending','completed','failed'))
);
--> statement-breakpoint
CREATE TABLE `agent_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`private_at` text,
	`session_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`initiated_by` text NOT NULL,
	`task_id` text,
	`source_message_id` text,
	`idempotency_key` text NOT NULL,
	`status` text NOT NULL,
	`prompt` text NOT NULL,
	`model` text NOT NULL,
	`instructions` text NOT NULL,
	`mandate_json` text NOT NULL,
	`result_text` text,
	`result_message_id` text,
	`last_error` text,
	`model_calls` integer DEFAULT 0 NOT NULL,
	`total_tokens` integer DEFAULT 0 NOT NULL,
	`event_cursor` integer DEFAULT 0 NOT NULL,
	`deadline` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`environment_json` text,
	`files_key` text,
	`task_edit_at` text,
	FOREIGN KEY (`session_id`) REFERENCES `agent_sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`user_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`initiated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "agent_runs_status_check" CHECK("agent_runs"."status" IN ('queued','running','completed','failed','cancelled'))
);
--> statement-breakpoint
CREATE INDEX `agent_runs_session_status` ON `agent_runs` (`session_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX agent_runs_root ON agent_runs(COALESCE(json_extract(mandate_json,'$.rootRunId'),id));--> statement-breakpoint
CREATE UNIQUE INDEX `agent_runs_agent_id_initiated_by_idempotency_key_unique` ON `agent_runs` (`agent_id`,`initiated_by`,`idempotency_key`);--> statement-breakpoint
CREATE TABLE `agent_schedule_occurrences` (
	`schedule_id` text NOT NULL,
	`due_at` text NOT NULL,
	`message_id` text NOT NULL,
	`run_id` text,
	`completed_at` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`failed_at` text,
	`last_error` text,
	PRIMARY KEY(`schedule_id`, `due_at`),
	FOREIGN KEY (`schedule_id`) REFERENCES `agent_schedules`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `agent_schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`principal_id` text NOT NULL,
	`created_by` text NOT NULL,
	`channel_id` text NOT NULL,
	`kind` text NOT NULL,
	`content` text NOT NULL,
	`agent_id` text,
	`task_id` text,
	`first_at` text NOT NULL,
	`timezone` text NOT NULL,
	`recurrence` text NOT NULL,
	`next_at` text,
	`status` text NOT NULL,
	`last_error` text,
	`authorization_json` text NOT NULL,
	`mandate_json` text,
	`created_at` text NOT NULL,
	`paused_at` text,
	`dismissed_at` text,
	`last_error_code` text,
	FOREIGN KEY (`principal_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`user_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "agent_schedules_kind_check" CHECK("agent_schedules"."kind" IN ('reminder','work')),
	CONSTRAINT "agent_schedules_recurrence_check" CHECK("agent_schedules"."recurrence" IN ('once','daily','weekly')),
	CONSTRAINT "agent_schedules_status_check" CHECK("agent_schedules"."status" IN ('active','completed','cancelled','blocked'))
);
--> statement-breakpoint
CREATE INDEX `agent_schedules_created_by_status_idx` ON `agent_schedules` (`created_by`,`status`,`next_at`);--> statement-breakpoint
CREATE INDEX `agent_schedules_principal_status_idx` ON `agent_schedules` (`principal_id`,`status`,`next_at`);--> statement-breakpoint
CREATE TABLE `agent_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`active_run_id` text,
	`transcript_key` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`untrusted_at` text,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`user_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_sessions_agent_id_channel_id_unique` ON `agent_sessions` (`agent_id`,`channel_id`);--> statement-breakpoint
CREATE TABLE `agent_tool_decisions` (
	`run_id` text NOT NULL,
	`call_id` text NOT NULL,
	`tool` text NOT NULL,
	`effect` text NOT NULL,
	`untrusted_context` integer NOT NULL,
	`decision` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`run_id`, `call_id`),
	FOREIGN KEY (`run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "agent_tool_decisions_effect_check" CHECK("agent_tool_decisions"."effect" IN ('control','read','write','external','unknown')),
	CONSTRAINT "agent_tool_decisions_untrusted_context_check" CHECK("agent_tool_decisions"."untrusted_context" IN (0,1)),
	CONSTRAINT "agent_tool_decisions_decision_check" CHECK("agent_tool_decisions"."decision" IN ('allowed','blocked'))
);
--> statement-breakpoint
CREATE TABLE `agent_turns` (
	`submission_id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`source_message_id` text NOT NULL,
	`initiated_by` text NOT NULL,
	`request_id` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`detail` text,
	`approval_json` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`user_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`initiated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "agent_turns_status_check" CHECK("agent_turns"."status" in ('queued', 'thinking', 'tool', 'waiting_approval'))
);
--> statement-breakpoint
CREATE INDEX `agent_turns_channel_agent_idx` ON `agent_turns` (`channel_id`,`agent_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_turns_request_id_unique` ON `agent_turns` (`request_id`);--> statement-breakpoint
CREATE TABLE `agent_webhooks` (
	`agent_id` text PRIMARY KEY NOT NULL,
	`url` text NOT NULL,
	`header_name` text DEFAULT 'Authorization' NOT NULL,
	`credential_json` text,
	`reply_timeout_minutes` integer DEFAULT 20 NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`user_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "agent_webhooks_reply_timeout_minutes_check" CHECK("agent_webhooks"."reply_timeout_minutes" BETWEEN 2 AND 120)
);
--> statement-breakpoint
CREATE TABLE `agents` (
	`harness` text DEFAULT 'pi' NOT NULL,
	`user_id` text PRIMARY KEY NOT NULL,
	`model` text DEFAULT '@cf/moonshotai/kimi-k2.7-code' NOT NULL,
	`instructions` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`access` text DEFAULT 'open' NOT NULL,
	`created_by` text NOT NULL,
	`last_active_at` text,
	`archived_at` text,
	`archived_by` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "agents_status_check" CHECK("agents"."status" in ('active', 'paused')),
	CONSTRAINT "agents_harness_check" CHECK("agents"."harness" IN ('think','pi')),
	CONSTRAINT "agents_access_check" CHECK("agents"."access" IN ('open','granted'))
);
--> statement-breakpoint
CREATE INDEX `agents_status_idx` ON `agents` (`status`);--> statement-breakpoint
CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` text,
	`channel_id` text NOT NULL,
	`uploader_id` text NOT NULL,
	`r2_key` text NOT NULL,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`width` integer,
	`height` integer,
	`created_at` text NOT NULL,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploader_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "attachments_size_check" CHECK("attachments"."size_bytes" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attachments_r2_key_unique` ON `attachments` (`r2_key`);--> statement-breakpoint
CREATE INDEX `attachments_message_id_idx` ON `attachments` (`message_id`);--> statement-breakpoint
CREATE INDEX `attachments_channel_id_idx` ON `attachments` (`channel_id`);--> statement-breakpoint
CREATE INDEX `attachments_uploader_id_idx` ON `attachments` (`uploader_id`);--> statement-breakpoint
CREATE TABLE `audit_log` (
	`space_id` text,
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`meta_json` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `audit_log_created_at_idx` ON `audit_log` (`created_at`);--> statement-breakpoint
CREATE INDEX `audit_log_actor_id_idx` ON `audit_log` (`actor_id`);--> statement-breakpoint
CREATE TABLE `auth_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (cast(unixepoch() * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch() * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `auth_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_accounts_provider_account_idx` ON `auth_accounts` (`provider_id`,`account_id`);--> statement-breakpoint
CREATE INDEX `auth_accounts_user_id_idx` ON `auth_accounts` (`user_id`);--> statement-breakpoint
CREATE TABLE `auth_provider_credentials` (
	`provider` text PRIMARY KEY NOT NULL,
	`public_key` text NOT NULL,
	`secret_ciphertext` text NOT NULL,
	`secret_iv` text NOT NULL,
	`secret_version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT "auth_provider_credentials_provider_check" CHECK("auth_provider_credentials"."provider" in ('github', 'google', 'twitter', 'linkedin', 'turnstile'))
);
--> statement-breakpoint
CREATE TABLE `auth_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch() * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch() * 1000 as integer)) NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `auth_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_sessions_token_unique` ON `auth_sessions` (`token`);--> statement-breakpoint
CREATE INDEX `auth_sessions_user_id_idx` ON `auth_sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `auth_settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`registration_mode` text DEFAULT 'invite_only' NOT NULL,
	`password_enabled` integer DEFAULT true NOT NULL,
	`github_enabled` integer DEFAULT false NOT NULL,
	`google_enabled` integer DEFAULT false NOT NULL,
	`linkedin_enabled` integer DEFAULT false NOT NULL,
	`twitter_enabled` integer DEFAULT false NOT NULL,
	`turnstile_enabled` integer DEFAULT false NOT NULL,
	`email_from` text,
	`email_from_name` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT "auth_settings_singleton_check" CHECK("auth_settings"."id" = 1),
	CONSTRAINT "auth_settings_registration_mode_check" CHECK("auth_settings"."registration_mode" in ('open', 'invite_only'))
);
--> statement-breakpoint
CREATE TABLE `auth_users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`username` text NOT NULL,
	`display_username` text,
	`pending_email` text,
	`image` text,
	`created_at` integer DEFAULT (cast(unixepoch() * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch() * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_users_email_unique` ON `auth_users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `auth_users_username_unique` ON `auth_users` (`username`);--> statement-breakpoint
CREATE TABLE `auth_verifications` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch() * 1000 as integer)),
	`updated_at` integer DEFAULT (cast(unixepoch() * 1000 as integer))
);
--> statement-breakpoint
CREATE TABLE `backup_destinations` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`endpoint` text NOT NULL,
	`region` text DEFAULT 'auto' NOT NULL,
	`bucket` text NOT NULL,
	`prefix` text DEFAULT 'zugoid' NOT NULL,
	`access_key_id` text NOT NULL,
	`secret_access_key_ciphertext` text NOT NULL,
	`secret_access_key_iv` text NOT NULL,
	`secret_access_key_version` integer DEFAULT 1 NOT NULL,
	`last_backup_key` text,
	`last_backup_at` text,
	`last_backup_size_bytes` integer,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT "backup_destinations_singleton_check" CHECK("backup_destinations"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE `canvas_edges` (
	`id` text PRIMARY KEY NOT NULL,
	`canvas_id` text NOT NULL,
	`from_node_id` text NOT NULL,
	`to_node_id` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`canvas_id`) REFERENCES `data_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`from_node_id`) REFERENCES `canvas_nodes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`to_node_id`) REFERENCES `canvas_nodes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "canvas_edges_not_self_check" CHECK("canvas_edges"."from_node_id" <> "canvas_edges"."to_node_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `canvas_edges_nodes_unique` ON `canvas_edges` (`canvas_id`,`from_node_id`,`to_node_id`);--> statement-breakpoint
CREATE INDEX `canvas_edges_canvas_idx` ON `canvas_edges` (`canvas_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `canvas_nodes` (
	`id` text PRIMARY KEY NOT NULL,
	`canvas_id` text NOT NULL,
	`kind` text DEFAULT 'note' NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`x` real DEFAULT 0 NOT NULL,
	`y` real DEFAULT 0 NOT NULL,
	`width` real DEFAULT 240 NOT NULL,
	`height` real DEFAULT 144 NOT NULL,
	`color` text DEFAULT 'neutral' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`canvas_id`) REFERENCES `data_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "canvas_nodes_kind_check" CHECK("canvas_nodes"."kind" in ('note', 'text')),
	CONSTRAINT "canvas_nodes_color_check" CHECK("canvas_nodes"."color" in ('neutral', 'orange', 'blue', 'green', 'red')),
	CONSTRAINT "canvas_nodes_version_check" CHECK("canvas_nodes"."version" > 0)
);
--> statement-breakpoint
CREATE INDEX `canvas_nodes_canvas_idx` ON `canvas_nodes` (`canvas_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `channel_attention` (
	`channel_id` text NOT NULL,
	`user_id` text NOT NULL,
	`following` integer DEFAULT false NOT NULL,
	`notifications` text DEFAULT 'default' NOT NULL,
	`read_generation` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`channel_id`, `user_id`),
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "channel_attention_notifications_check" CHECK("channel_attention"."notifications" in ('default', 'all', 'mentions', 'muted'))
);
--> statement-breakpoint
CREATE INDEX `channel_attention_user_idx` ON `channel_attention` (`user_id`,`following`);--> statement-breakpoint
CREATE TABLE `channel_categories` (
	`space_id` text DEFAULT '00000000-0000-4000-8000-00000000000d' NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `channel_categories_position_idx` ON `channel_categories` (`position`);--> statement-breakpoint
CREATE INDEX `channel_categories_space_idx` ON `channel_categories` (`space_id`);--> statement-breakpoint
CREATE TABLE `channel_members` (
	`channel_id` text NOT NULL,
	`user_id` text NOT NULL,
	`hidden_at` text,
	`joined_at` text NOT NULL,
	PRIMARY KEY(`channel_id`, `user_id`),
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `channel_members_user_id_idx` ON `channel_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `channel_reads` (
	`channel_id` text NOT NULL,
	`user_id` text NOT NULL,
	`last_read_message_id` text,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`channel_id`, `user_id`),
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`last_read_message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `channel_reads_user_id_idx` ON `channel_reads` (`user_id`);--> statement-breakpoint
CREATE TABLE `channel_role_denies` (
	`channel_id` text NOT NULL,
	`role_id` text NOT NULL,
	`deny_mask` integer NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`channel_id`, `role_id`),
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "channel_role_denies_mask_check" CHECK("channel_role_denies"."deny_mask" > 0 and ("channel_role_denies"."deny_mask" & ~112) = 0)
);
--> statement-breakpoint
CREATE TABLE `channels` (
	`space_id` text DEFAULT '00000000-0000-4000-8000-00000000000d' NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`topic` text DEFAULT '' NOT NULL,
	`type` text NOT NULL,
	`section` text DEFAULT 'chat' NOT NULL,
	`visibility` text DEFAULT 'server' NOT NULL,
	`category_id` text,
	`position` integer DEFAULT 0 NOT NULL,
	`created_by` text,
	`dm_kind` text DEFAULT 'pair' NOT NULL,
	`dm_owner_id` text,
	`dm_pair_key` text,
	`live_meeting_id` text,
	`archived_at` text,
	`archived_by` text,
	`parent_id` text,
	`parent_message_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `channel_categories`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`dm_owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`archived_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`parent_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "channels_type_check" CHECK("channels"."type" in ('text', 'thread', 'dm', 'conversation')),
	CONSTRAINT "channels_section_check" CHECK("channels"."section" in ('chat', 'customers')),
	CONSTRAINT "channels_visibility_check" CHECK("channels"."visibility" in ('server', 'private')),
	CONSTRAINT "channels_dm_private_check" CHECK("channels"."type" <> 'dm' or "channels"."visibility" = 'private'),
	CONSTRAINT "channels_thread_parent_check" CHECK(
    ("channels"."type" = 'thread' and "channels"."parent_id" is not null and "channels"."parent_message_id" is not null)
    or ("channels"."type" = 'conversation' and "channels"."parent_id" is not null and "channels"."parent_message_id" is null)
    or ("channels"."type" not in ('thread', 'conversation') and "channels"."parent_id" is null and "channels"."parent_message_id" is null)
  ),
	CONSTRAINT "channels_conversation_section_check" CHECK("channels"."type" <> 'conversation' or "channels"."section" = 'customers'),
	CONSTRAINT "channels_dm_kind_check" CHECK("channels"."dm_kind" IN ('pair', 'group'))
);
--> statement-breakpoint
CREATE INDEX `channels_position_idx` ON `channels` (`position`);--> statement-breakpoint
CREATE INDEX `channels_type_idx` ON `channels` (`type`);--> statement-breakpoint
CREATE INDEX `channels_category_id_idx` ON `channels` (`category_id`);--> statement-breakpoint
CREATE INDEX `channels_parent_id_idx` ON `channels` (`parent_id`);--> statement-breakpoint
CREATE INDEX `channels_section_type_idx` ON `channels` (`section`,`type`);--> statement-breakpoint
CREATE UNIQUE INDEX `channels_thread_root_unique` ON `channels` (`parent_message_id`) WHERE "channels"."type" = 'thread';--> statement-breakpoint
CREATE UNIQUE INDEX `channels_dm_pair_key_unique` ON `channels` (`dm_pair_key`) WHERE "channels"."dm_pair_key" is not null;--> statement-breakpoint
CREATE INDEX `channels_space_idx` ON `channels` (`space_id`);--> statement-breakpoint
CREATE TABLE `compute_nodes` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`capabilities_json` text DEFAULT '{}' NOT NULL,
	`last_seen` text,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `compute_pairings` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_by` text NOT NULL,
	`expires_at` text NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `connection_grants` (
	`code_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`session_id` text NOT NULL,
	`challenge` text NOT NULL,
	`redirect_uri` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `auth_users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `auth_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `customer_companies` (
	`space_id` text DEFAULT '00000000-0000-4000-8000-00000000000d' NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`owner_id` text,
	`created_by` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `customer_companies_space_name_idx` ON `customer_companies` (`space_id`,`name`);--> statement-breakpoint
CREATE TABLE `customer_company_domains` (
	`space_id` text DEFAULT '00000000-0000-4000-8000-00000000000d' NOT NULL,
	`domain` text NOT NULL,
	`company_id` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	PRIMARY KEY(`space_id`, `domain`),
	FOREIGN KEY (`company_id`) REFERENCES `customer_companies`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "customer_company_domains_domain_check" CHECK("customer_company_domains"."domain" = lower("customer_company_domains"."domain") and length("customer_company_domains"."domain") between 3 and 253)
);
--> statement-breakpoint
CREATE INDEX `customer_company_domains_company_idx` ON `customer_company_domains` (`company_id`);--> statement-breakpoint
CREATE TABLE `customer_contact_companies` (
	`contact_id` text NOT NULL,
	`company_id` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`current` integer DEFAULT true NOT NULL,
	`linked_by` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	PRIMARY KEY(`contact_id`, `company_id`),
	FOREIGN KEY (`contact_id`) REFERENCES `customer_contacts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`company_id`) REFERENCES `customer_companies`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "customer_contact_companies_linked_by_check" CHECK("customer_contact_companies"."linked_by" in ('domain', 'member'))
);
--> statement-breakpoint
CREATE INDEX `customer_contact_companies_company_idx` ON `customer_contact_companies` (`company_id`,`current`);--> statement-breakpoint
CREATE TABLE `customer_contacts` (
	`space_id` text DEFAULT '00000000-0000-4000-8000-00000000000d' NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`owner_id` text,
	`first_seen_at` text NOT NULL,
	`last_seen_at` text,
	`last_contacted_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `customer_contacts_space_seen_idx` ON `customer_contacts` (`space_id`,`last_seen_at`);--> statement-breakpoint
CREATE INDEX `customer_contacts_space_name_idx` ON `customer_contacts` (`space_id`,`name`);--> statement-breakpoint
CREATE TABLE `customer_conversations` (
	`channel_id` text PRIMARY KEY NOT NULL,
	`source_channel_id` text NOT NULL,
	`contact_id` text,
	`status` text DEFAULT 'open' NOT NULL,
	`assignee_id` text,
	`identity_id` text,
	`last_message_at` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_channel_id`) REFERENCES `customer_sources`(`channel_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contact_id`) REFERENCES `customer_contacts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`assignee_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`identity_id`) REFERENCES `customer_identities`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "customer_conversations_status_check" CHECK("customer_conversations"."status" in ('open', 'waiting', 'resolved', 'spam', 'trash'))
);
--> statement-breakpoint
CREATE INDEX `customer_conversations_identity_idx` ON `customer_conversations` (`identity_id`,`source_channel_id`,`last_message_at`);--> statement-breakpoint
CREATE INDEX `customer_conversations_source_status_latest_idx` ON `customer_conversations` (`source_channel_id`,`status`,`last_message_at`);--> statement-breakpoint
CREATE INDEX `customer_conversations_contact_latest_idx` ON `customer_conversations` (`contact_id`,`last_message_at`);--> statement-breakpoint
CREATE INDEX `customer_conversations_assignee_idx` ON `customer_conversations` (`assignee_id`,`status`);--> statement-breakpoint
CREATE TABLE `customer_identities` (
	`space_id` text DEFAULT '00000000-0000-4000-8000-00000000000d' NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`value` text NOT NULL,
	`display_name` text,
	`contact_id` text NOT NULL,
	`verified_at` text,
	`verified_by` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`contact_id`) REFERENCES `customer_contacts`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "customer_identities_kind_check" CHECK("customer_identities"."kind" in ('email', 'browser')),
	CONSTRAINT "customer_identities_verified_check" CHECK(("customer_identities"."verified_at" is null) = ("customer_identities"."verified_by" is null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customer_identities_value_unique` ON `customer_identities` (`space_id`,`kind`,`value`);--> statement-breakpoint
CREATE INDEX `customer_identities_contact_idx` ON `customer_identities` (`contact_id`);--> statement-breakpoint
CREATE TABLE `customer_sources` (
	`channel_id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`first_line_agent_id` text,
	`first_line_enabled` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`first_line_agent_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "customer_sources_kind_check" CHECK("customer_sources"."kind" in ('mailbox', 'widget'))
);
--> statement-breakpoint
CREATE TABLE `customer_visitors` (
	`id` text PRIMARY KEY NOT NULL,
	`widget_channel_id` text NOT NULL,
	`identity_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`claimed_name` text,
	`claimed_email` text,
	`user_agent` text,
	`country` text,
	`created_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	FOREIGN KEY (`widget_channel_id`) REFERENCES `customer_widgets`(`channel_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`identity_id`) REFERENCES `customer_identities`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "customer_visitors_user_agent_check" CHECK("customer_visitors"."user_agent" is null or length("customer_visitors"."user_agent") <= 512)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customer_visitors_token_hash_unique` ON `customer_visitors` (`token_hash`);--> statement-breakpoint
CREATE INDEX `customer_visitors_widget_idx` ON `customer_visitors` (`widget_channel_id`,`last_seen_at`);--> statement-breakpoint
CREATE INDEX `customer_visitors_identity_idx` ON `customer_visitors` (`identity_id`);--> statement-breakpoint
CREATE TABLE `customer_widget_messages` (
	`message_id` text PRIMARY KEY NOT NULL,
	`conversation_channel_id` text NOT NULL,
	`direction` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conversation_channel_id`) REFERENCES `customer_conversations`(`channel_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "customer_widget_messages_direction_check" CHECK("customer_widget_messages"."direction" in ('inbound', 'outbound'))
);
--> statement-breakpoint
CREATE INDEX `customer_widget_messages_conversation_idx` ON `customer_widget_messages` (`conversation_channel_id`,`message_id`);--> statement-breakpoint
CREATE TABLE `customer_widgets` (
	`channel_id` text PRIMARY KEY NOT NULL,
	`public_id` text NOT NULL,
	`name` text NOT NULL,
	`sites_json` text DEFAULT '[]' NOT NULL,
	`greeting` text DEFAULT '' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_by` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`channel_id`) REFERENCES `customer_sources`(`channel_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customer_widgets_public_id_unique` ON `customer_widgets` (`public_id`);--> statement-breakpoint
CREATE TABLE `data_bookmarks` (
	`user_id` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	PRIMARY KEY(`user_id`, `target_type`, `target_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "data_bookmarks_target_type_check" CHECK("data_bookmarks"."target_type" in ('database_view', 'item'))
);
--> statement-breakpoint
CREATE INDEX `data_bookmarks_user_position_idx` ON `data_bookmarks` (`user_id`,`position`,`created_at`);--> statement-breakpoint
CREATE TABLE `data_items` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text DEFAULT '00000000-0000-4000-8000-00000000000d' NOT NULL,
	`kind` text DEFAULT 'page' NOT NULL,
	`parent_id` text,
	`content` text DEFAULT '' NOT NULL,
	`icon` text,
	`deleted_at` text,
	`mutation_id` text,
	`database_id` text,
	`title` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_by` text NOT NULL,
	`text_1` text,
	`text_2` text,
	`text_3` text,
	`text_4` text,
	`text_5` text,
	`text_6` text,
	`text_7` text,
	`text_8` text,
	`text_9` text,
	`text_10` text,
	`text_11` text,
	`text_12` text,
	`text_13` text,
	`text_14` text,
	`text_15` text,
	`text_16` text,
	`number_1` real,
	`number_2` real,
	`number_3` real,
	`number_4` real,
	`number_5` real,
	`number_6` real,
	`number_7` real,
	`number_8` real,
	`boolean_1` integer,
	`boolean_2` integer,
	`boolean_3` integer,
	`boolean_4` integer,
	`boolean_5` integer,
	`boolean_6` integer,
	`boolean_7` integer,
	`boolean_8` integer,
	`date_1` text,
	`date_2` text,
	`date_3` text,
	`date_4` text,
	`date_5` text,
	`date_6` text,
	`date_7` text,
	`date_8` text,
	`select_1` text,
	`select_2` text,
	`select_3` text,
	`select_4` text,
	`select_5` text,
	`select_6` text,
	`select_7` text,
	`select_8` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`parent_id`) REFERENCES `data_items`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`database_id`) REFERENCES `database_definitions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "data_items_kind_check" CHECK("data_items"."kind" in ('page', 'canvas')),
	CONSTRAINT "database_items_version_check" CHECK("data_items"."version" > 0)
);
--> statement-breakpoint
CREATE INDEX `data_items_parent_idx` ON `data_items` (`space_id`,`parent_id`,`position`);--> statement-breakpoint
CREATE INDEX `data_items_parent_id_idx` ON `data_items` (`parent_id`);--> statement-breakpoint
CREATE INDEX `database_items_database_position_idx` ON `data_items` (`database_id`,`position`);--> statement-breakpoint
CREATE INDEX `database_items_active_position_idx` ON `data_items` (`database_id`,`position`,`created_at`,`id`) WHERE "data_items"."deleted_at" is null;--> statement-breakpoint
CREATE TABLE `data_record_requests` (
	`principal_id` text NOT NULL,
	`database_id` text NOT NULL,
	`request_id` text NOT NULL,
	`record_id` text,
	`body_hash` text NOT NULL,
	PRIMARY KEY(`principal_id`, `database_id`, `request_id`),
	FOREIGN KEY (`principal_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`database_id`) REFERENCES `database_definitions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`record_id`) REFERENCES `data_items`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `data_references` (
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	PRIMARY KEY(`source_type`, `source_id`, `target_type`, `target_id`),
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "data_references_source_check" CHECK("data_references"."source_type" in ('item','document','record','database','canvas','task')),
	CONSTRAINT "data_references_target_check" CHECK("data_references"."target_type" in ('item','document','record','database','canvas','task'))
);
--> statement-breakpoint
CREATE INDEX `data_references_target_idx` ON `data_references` (`target_type`,`target_id`);--> statement-breakpoint
CREATE TABLE `database_definitions` (
	`space_id` text DEFAULT '00000000-0000-4000-8000-00000000000d' NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`deleted_at` text,
	`name` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_by` text NOT NULL,
	`archived_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `database_definitions_name_unique` ON `database_definitions` (`space_id`,lower("name"));--> statement-breakpoint
CREATE INDEX `database_definitions_position_idx` ON `database_definitions` (`position`);--> statement-breakpoint
CREATE INDEX `database_definitions_space_idx` ON `database_definitions` (`space_id`);--> statement-breakpoint
CREATE TABLE `database_fields` (
	`id` text PRIMARY KEY NOT NULL,
	`deleted_at` text,
	`database_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`slot` text NOT NULL,
	`config_json` text DEFAULT '{}' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`database_id`) REFERENCES `database_definitions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "database_fields_type_check" CHECK("database_fields"."type" in ('text', 'number', 'boolean', 'date', 'select', 'multi_select', 'url', 'email', 'phone', 'person', 'relation'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `database_fields_name_unique` ON `database_fields` (`database_id`,`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `database_fields_slot_unique` ON `database_fields` (`database_id`,`slot`);--> statement-breakpoint
CREATE INDEX `database_fields_position_idx` ON `database_fields` (`database_id`,`position`);--> statement-breakpoint
CREATE TABLE `database_item_links` (
	`id` text PRIMARY KEY NOT NULL,
	`field_id` text NOT NULL,
	`item_id` text NOT NULL,
	`target_item_id` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`field_id`) REFERENCES `database_fields`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `data_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_item_id`) REFERENCES `data_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `database_item_links_unique` ON `database_item_links` (`field_id`,`item_id`,`target_item_id`);--> statement-breakpoint
CREATE INDEX `database_item_links_item_idx` ON `database_item_links` (`item_id`,`field_id`,`position`);--> statement-breakpoint
CREATE INDEX `database_item_links_target_idx` ON `database_item_links` (`target_item_id`);--> statement-breakpoint
CREATE TABLE `database_views` (
	`id` text PRIMARY KEY NOT NULL,
	`deleted_at` text,
	`database_id` text NOT NULL,
	`name` text NOT NULL,
	`layout` text DEFAULT 'table' NOT NULL,
	`config_json` text DEFAULT '{"visibleFieldIds":null,"filters":[],"sorts":[{"fieldId":"title","direction":"asc"}],"groupFieldId":null,"dateFieldId":null}' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`database_id`) REFERENCES `database_definitions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "database_views_layout_check" CHECK("database_views"."layout" in ('table', 'board', 'calendar', 'list', 'gallery')),
	CONSTRAINT "database_views_version_check" CHECK("database_views"."version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `database_views_name_unique` ON `database_views` (`database_id`,`name`);--> statement-breakpoint
CREATE INDEX `database_views_database_position_idx` ON `database_views` (`database_id`,`position`);--> statement-breakpoint
CREATE TABLE `document_revisions` (
	`document_id` text NOT NULL,
	`version` integer NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`saved_at` text NOT NULL,
	PRIMARY KEY(`document_id`, `version`),
	FOREIGN KEY (`document_id`) REFERENCES `data_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `email_domains` (
	`id` text PRIMARY KEY NOT NULL,
	`zone_id` text NOT NULL,
	`domain` text NOT NULL,
	`app_hostname` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `email_domains_domain_unique` ON `email_domains` (`domain`);--> statement-breakpoint
CREATE TABLE `email_mailboxes` (
	`channel_id` text PRIMARY KEY NOT NULL,
	`domain_id` text NOT NULL,
	`local_part` text NOT NULL,
	`display_name` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`domain_id`) REFERENCES `email_domains`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "email_mailboxes_local_part_check" CHECK("email_mailboxes"."local_part" = lower("email_mailboxes"."local_part") and length("email_mailboxes"."local_part") between 1 and 64)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `email_mailboxes_address_unique` ON `email_mailboxes` (`domain_id`,`local_part`);--> statement-breakpoint
CREATE TABLE `email_messages` (
	`message_id` text PRIMARY KEY NOT NULL,
	`thread_channel_id` text NOT NULL,
	`direction` text NOT NULL,
	`from_address` text NOT NULL,
	`from_name` text,
	`to_json` text DEFAULT '[]' NOT NULL,
	`cc_json` text DEFAULT '[]' NOT NULL,
	`bcc_json` text DEFAULT '[]' NOT NULL,
	`rfc_message_id` text,
	`provider_message_id` text,
	`delivery_started_at` text,
	`reply_to_json` text DEFAULT '[]' NOT NULL,
	`in_reply_to` text,
	`references_json` text DEFAULT '[]' NOT NULL,
	`delivery_status` text DEFAULT 'received' NOT NULL,
	`raw_r2_key` text,
	`created_at` text NOT NULL,
	`mailbox_channel_id` text,
	`client_request_id` text,
	`delivery_attempts` integer DEFAULT 0 NOT NULL,
	`delivery_error` text,
	`delivered_at` text,
	`auth_verdict` text,
	`body_format` text DEFAULT 'text' NOT NULL,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`thread_channel_id`) REFERENCES `email_threads`(`channel_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`mailbox_channel_id`) REFERENCES `email_mailboxes`(`channel_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "email_messages_direction_check" CHECK("email_messages"."direction" in ('inbound', 'outbound')),
	CONSTRAINT "email_messages_delivery_status_check" CHECK("email_messages"."delivery_status" in ('received', 'pending', 'sent', 'failed')),
	CONSTRAINT "email_messages_body_format_check" CHECK("email_messages"."body_format" in ('text', 'markdown'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `email_messages_mailbox_rfc_message_id_unique` ON `email_messages` (`mailbox_channel_id`,`rfc_message_id`) WHERE "email_messages"."rfc_message_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX `email_messages_mailbox_client_request_unique` ON `email_messages` (`mailbox_channel_id`,`client_request_id`) WHERE "email_messages"."client_request_id" is not null;--> statement-breakpoint
CREATE INDEX `email_messages_thread_created_idx` ON `email_messages` (`thread_channel_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `email_threads` (
	`channel_id` text PRIMARY KEY NOT NULL,
	`mailbox_channel_id` text NOT NULL,
	`subject` text NOT NULL,
	`participants_json` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`channel_id`) REFERENCES `customer_conversations`(`channel_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`mailbox_channel_id`) REFERENCES `email_mailboxes`(`channel_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `email_threads_mailbox_idx` ON `email_threads` (`mailbox_channel_id`);--> statement-breakpoint
CREATE TABLE `factory_approvals` (
	`id` text PRIMARY KEY NOT NULL,
	`box_id` text NOT NULL,
	`run_id` text NOT NULL,
	`call_id` text NOT NULL,
	`kind` text NOT NULL,
	`request_json` text NOT NULL,
	`digest` text NOT NULL,
	`status` text NOT NULL,
	`diff_key` text,
	`diff_digest` text,
	`decided_by` text,
	`decided_at` text,
	`expires_at` text NOT NULL,
	`result_json` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`box_id`) REFERENCES `factory_boxes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`decided_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "factory_approvals_kind_check" CHECK("factory_approvals"."kind" IN ('plan','publish','window','merge')),
	CONSTRAINT "factory_approvals_status_check" CHECK("factory_approvals"."status" IN ('pending_diff','pending','approved','publishing','rejected','expired','completed','failed','uncertain'))
);
--> statement-breakpoint
CREATE INDEX `factory_approvals_box` ON `factory_approvals` (`box_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `factory_approvals_run_id_call_id_unique` ON `factory_approvals` (`run_id`,`call_id`);--> statement-breakpoint
CREATE TABLE `factory_boxes` (
	`id` text PRIMARY KEY NOT NULL,
	`channel_id` text NOT NULL,
	`task_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`initiated_by` text NOT NULL,
	`node_id` text NOT NULL,
	`environment_json` text NOT NULL,
	`origin_run_id` text NOT NULL,
	`run_id` text,
	`status` text DEFAULT 'new' NOT NULL,
	`lease_token` text,
	`lease_until` text,
	`cpu` real,
	`memory_mib` integer,
	`checkpoint_sha` text,
	`head_sha` text,
	`pull_json` text,
	`pushed_sha` text,
	`runtime_ms` integer DEFAULT 0 NOT NULL,
	`publication_count` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`user_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`initiated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`node_id`) REFERENCES `compute_nodes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`origin_run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "factory_boxes_status_check" CHECK("factory_boxes"."status" IN ('new','queued','starting','running','idle','stopped','released','failed'))
);
--> statement-breakpoint
CREATE INDEX `factory_boxes_node` ON `factory_boxes` (`node_id`,`status`);--> statement-breakpoint
CREATE INDEX `factory_boxes_run` ON `factory_boxes` (`run_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `factory_boxes_task_id_agent_id_initiated_by_unique` ON `factory_boxes` (`task_id`,`agent_id`,`initiated_by`);--> statement-breakpoint
CREATE TABLE `file_deletions` (
	`key` text PRIMARY KEY NOT NULL,
	`scope_id` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `file_deletions_scope_idx` ON `file_deletions` (`scope_id`);--> statement-breakpoint
CREATE TABLE `file_objects` (
	`key` text PRIMARY KEY NOT NULL,
	`storage_key` text NOT NULL,
	`size` integer NOT NULL,
	`etag` text NOT NULL,
	`uploaded_at` text NOT NULL,
	`metadata` text NOT NULL,
	`copied` integer DEFAULT false NOT NULL,
	CONSTRAINT "file_objects_size_check" CHECK("file_objects"."size" >= 0),
	CONSTRAINT "file_objects_copied_check" CHECK("file_objects"."copied" IN (0,1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `file_objects_storage_key_unique` ON `file_objects` (`storage_key`);--> statement-breakpoint
CREATE TABLE `file_uploads` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT "file_uploads_size_check" CHECK("file_uploads"."size" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `file_uploads_key_unique` ON `file_uploads` (`key`);--> statement-breakpoint
CREATE TABLE `gadget_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`gadget_id` text NOT NULL,
	`version` integer NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`spec_json` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`gadget_id`) REFERENCES `gadgets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "gadget_versions_version_check" CHECK("gadget_versions"."version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gadget_versions_number_unique` ON `gadget_versions` (`gadget_id`,`version`);--> statement-breakpoint
CREATE TABLE `gadgets` (
	`space_id` text DEFAULT '00000000-0000-4000-8000-00000000000d' NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`draft_spec_json` text NOT NULL,
	`draft_revision` integer DEFAULT 1 NOT NULL,
	`published_version` integer,
	`position` integer DEFAULT 0 NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "gadgets_draft_revision_check" CHECK("gadgets"."draft_revision" > 0),
	CONSTRAINT "gadgets_published_version_check" CHECK("gadgets"."published_version" is null or "gadgets"."published_version" > 0)
);
--> statement-breakpoint
CREATE INDEX `gadgets_position_idx` ON `gadgets` (`position`,`created_at`);--> statement-breakpoint
CREATE INDEX `gadgets_space_idx` ON `gadgets` (`space_id`);--> statement-breakpoint
CREATE TABLE `git_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`provider` text NOT NULL,
	`host` text NOT NULL,
	`account` text NOT NULL,
	`app_id` text NOT NULL,
	`app_slug` text NOT NULL,
	`credential_json` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `git_setup_requests` (
	`state_hash` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`account` text NOT NULL,
	`actor_id` text NOT NULL,
	`origin` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "git_setup_requests_status_check" CHECK("git_setup_requests"."status" IN ('pending','exchanging','complete','failed'))
);
--> statement-breakpoint
CREATE TABLE `grants` (
	`id` text PRIMARY KEY NOT NULL,
	`member_id` text,
	`role_id` text,
	`agent_id` text,
	`policy_id` text,
	`permissions` integer,
	`project_id` text,
	`channel_id` text,
	`mailbox_id` text,
	`gadget_id` text,
	`gadget_version_id` text,
	`connection_id` text,
	`daily_runs` integer,
	`expires_at` text,
	`created_by` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`user_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`policy_id`) REFERENCES `project_policies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`mailbox_id`) REFERENCES `email_mailboxes`(`channel_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`gadget_id`) REFERENCES `gadgets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`gadget_version_id`) REFERENCES `gadget_versions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`connection_id`) REFERENCES `mcp_outbound_connections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "grants_subject" CHECK(("grants"."member_id" IS NOT NULL AND "grants"."role_id" IS NULL) OR ("grants"."role_id" IS NOT NULL AND "grants"."member_id" IS NULL)),
	CONSTRAINT "grants_content" CHECK(("grants"."policy_id" IS NULL) <> ("grants"."permissions" IS NULL)),
	CONSTRAINT "grants_permissions" CHECK("grants"."permissions" IS NULL OR "grants"."permissions" > 0),
	CONSTRAINT "grants_daily_runs" CHECK("grants"."daily_runs" IS NULL OR "grants"."daily_runs" BETWEEN 1 AND 10000),
	CONSTRAINT "grants_one_scope" CHECK(("grants"."project_id" IS NOT NULL) + ("grants"."channel_id" IS NOT NULL) + ("grants"."mailbox_id" IS NOT NULL) + ("grants"."gadget_id" IS NOT NULL) + ("grants"."gadget_version_id" IS NOT NULL) + ("grants"."connection_id" IS NOT NULL) <= 1),
	CONSTRAINT "grants_scope" CHECK("grants"."agent_id" IS NOT NULL OR "grants"."project_id" IS NOT NULL OR "grants"."channel_id" IS NOT NULL OR "grants"."mailbox_id" IS NOT NULL OR "grants"."gadget_id" IS NOT NULL OR "grants"."gadget_version_id" IS NOT NULL OR "grants"."connection_id" IS NOT NULL),
	CONSTRAINT "grants_agent_limits" CHECK("grants"."agent_id" IS NOT NULL OR ("grants"."daily_runs" IS NULL AND "grants"."expires_at" IS NULL)),
	CONSTRAINT "grants_policy_scope" CHECK(("grants"."policy_id" IS NOT NULL) = ("grants"."channel_id" IS NULL AND "grants"."mailbox_id" IS NULL AND "grants"."gadget_id" IS NULL AND "grants"."gadget_version_id" IS NULL AND "grants"."connection_id" IS NULL)),
	CONSTRAINT "grants_channel" CHECK("grants"."channel_id" IS NULL OR ("grants"."role_id" IS NOT NULL AND ("grants"."permissions" & ~112) = 0)),
	CONSTRAINT "grants_mailbox" CHECK("grants"."mailbox_id" IS NULL OR ("grants"."member_id" IS NOT NULL AND "grants"."permissions" IN (536870912, 1610612736, 1610612738))),
	CONSTRAINT "grants_gadget" CHECK(("grants"."gadget_id" IS NULL AND "grants"."gadget_version_id" IS NULL) OR ("grants"."role_id" IS NOT NULL AND "grants"."permissions" = 1024)),
	CONSTRAINT "grants_connection" CHECK("grants"."connection_id" IS NULL OR "grants"."permissions" = 33554432)
);
--> statement-breakpoint
CREATE UNIQUE INDEX grants_member_identity ON grants(member_id,coalesce(agent_id,''),coalesce(project_id,''),policy_id) WHERE member_id IS NOT NULL AND policy_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX grants_role_identity ON grants(role_id,coalesce(agent_id,''),coalesce(project_id,''),policy_id) WHERE role_id IS NOT NULL AND policy_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `grants_channel_identity` ON `grants` (`channel_id`,`role_id`) WHERE "grants"."channel_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `grants_mailbox_identity` ON `grants` (`mailbox_id`,`member_id`) WHERE "grants"."mailbox_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `grants_gadget_identity` ON `grants` (`gadget_id`,`role_id`) WHERE "grants"."gadget_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `grants_gadget_version_identity` ON `grants` (`gadget_version_id`,`role_id`) WHERE "grants"."gadget_version_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX grants_connection_identity ON grants(connection_id,coalesce(member_id,''),coalesce(role_id,'')) WHERE connection_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX `grants_member` ON `grants` (`member_id`,`agent_id`,`project_id`);--> statement-breakpoint
CREATE INDEX `grants_role` ON `grants` (`role_id`,`agent_id`,`project_id`);--> statement-breakpoint
CREATE INDEX `grants_project` ON `grants` (`project_id`);--> statement-breakpoint
CREATE INDEX `grants_member_mailbox` ON `grants` (`member_id`,`mailbox_id`) WHERE "grants"."mailbox_id" IS NOT NULL;--> statement-breakpoint
CREATE TABLE `invites` (
	`space_id` text DEFAULT '00000000-0000-4000-8000-00000000000d' NOT NULL,
	`code` text PRIMARY KEY NOT NULL,
	`creator_id` text NOT NULL,
	`max_uses` integer DEFAULT 0 NOT NULL,
	`uses` integer DEFAULT 0 NOT NULL,
	`expires_at` text,
	`created_at` text NOT NULL,
	`project_id` text,
	`policy_id` text,
	FOREIGN KEY (`creator_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`policy_id`) REFERENCES `project_policies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `invites_creator_id_idx` ON `invites` (`creator_id`);--> statement-breakpoint
CREATE INDEX `invites_expires_at_idx` ON `invites` (`expires_at`);--> statement-breakpoint
CREATE TABLE `mail_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`mailbox_channel_id` text NOT NULL,
	`thread_channel_id` text,
	`author_id` text NOT NULL,
	`to_json` text DEFAULT '[]' NOT NULL,
	`cc_json` text DEFAULT '[]' NOT NULL,
	`bcc_json` text DEFAULT '[]' NOT NULL,
	`subject` text DEFAULT '' NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`body_format` text DEFAULT 'text' NOT NULL,
	`attachment_ids_json` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`mailbox_channel_id`) REFERENCES `email_mailboxes`(`channel_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`thread_channel_id`) REFERENCES `email_threads`(`channel_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "mail_drafts_body_format_check" CHECK("mail_drafts"."body_format" in ('text', 'markdown'))
);
--> statement-breakpoint
CREATE INDEX `mail_drafts_author_mailbox_idx` ON `mail_drafts` (`author_id`,`mailbox_channel_id`,`updated_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `mail_drafts_author_thread_unique` ON `mail_drafts` (`author_id`,`thread_channel_id`) WHERE "mail_drafts"."thread_channel_id" is not null;--> statement-breakpoint
CREATE TABLE `mcp_access_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`token_prefix` text NOT NULL,
	`scopes_json` text NOT NULL,
	`subject_id` text NOT NULL,
	`created_by` text NOT NULL,
	`last_used_at` text,
	`revoked_at` text,
	`space_id` text,
	`board_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`subject_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`board_id`) REFERENCES `task_boards`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mcp_access_tokens_hash_unique` ON `mcp_access_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `mcp_access_tokens_subject_id_idx` ON `mcp_access_tokens` (`subject_id`);--> statement-breakpoint
CREATE INDEX `mcp_access_tokens_created_by_idx` ON `mcp_access_tokens` (`created_by`);--> statement-breakpoint
CREATE INDEX `mcp_access_tokens_active_idx` ON `mcp_access_tokens` (`revoked_at`,`created_at`);--> statement-breakpoint
CREATE INDEX `mcp_access_tokens_recording_keys_idx` ON `mcp_access_tokens` (`created_by`) WHERE "mcp_access_tokens"."space_id" IS NOT NULL;--> statement-breakpoint
CREATE TABLE `mcp_oauth_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`subject_id` text NOT NULL,
	`created_by` text NOT NULL,
	`resource` text NOT NULL,
	`scopes_json` text NOT NULL,
	`created_at` text NOT NULL,
	`last_used_at` text,
	`revoked_at` text,
	FOREIGN KEY (`client_id`) REFERENCES `auth_oauth_client`(`client_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`subject_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `mcp_oauth_connections_created_by_idx` ON `mcp_oauth_connections` (`created_by`);--> statement-breakpoint
CREATE INDEX `mcp_oauth_connections_subject_id_idx` ON `mcp_oauth_connections` (`subject_id`);--> statement-breakpoint
CREATE TABLE `mcp_outbound_connections` (
	`space_id` text DEFAULT '00000000-0000-4000-8000-00000000000d' NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`server_id` text NOT NULL,
	`owner_id` text,
	`created_by` text NOT NULL,
	`name` text NOT NULL,
	`provider_id` text NOT NULL,
	`endpoint` text,
	`description` text DEFAULT '' NOT NULL,
	`auth_kind` text DEFAULT 'none' NOT NULL,
	`enabled` integer DEFAULT 0 NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`tool_names_json` text NOT NULL,
	`tools_json` text DEFAULT '[]' NOT NULL,
	`credential_json` text,
	`credential_expires_at` text,
	`checked_at` text,
	`last_error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`server_id`) REFERENCES `server`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "mcp_outbound_enabled" CHECK("mcp_outbound_connections"."enabled" IN (0,1))
);
--> statement-breakpoint
CREATE INDEX `mcp_outbound_server_owner` ON `mcp_outbound_connections` (`server_id`,`owner_id`);--> statement-breakpoint
CREATE INDEX `mcp_outbound_connections_space_idx` ON `mcp_outbound_connections` (`space_id`);--> statement-breakpoint
CREATE TABLE `message_mentions` (
	`message_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role_id` text,
	PRIMARY KEY(`message_id`, `user_id`),
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `message_mentions_user_id_idx` ON `message_mentions` (`user_id`);--> statement-breakpoint
CREATE TABLE `message_pins` (
	`message_id` text PRIMARY KEY NOT NULL,
	`pinned_by` text NOT NULL,
	`pinned_at` text NOT NULL,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`pinned_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `message_pins_pinned_by_idx` ON `message_pins` (`pinned_by`);--> statement-breakpoint
CREATE INDEX `message_pins_pinned_at_idx` ON `message_pins` (`pinned_at`);--> statement-breakpoint
CREATE TABLE `message_reactions` (
	`message_id` text NOT NULL,
	`user_id` text NOT NULL,
	`emoji` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`message_id`, `user_id`, `emoji`),
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `message_reactions_user_id_idx` ON `message_reactions` (`user_id`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`channel_id` text NOT NULL,
	`author_id` text NOT NULL,
	`content` text NOT NULL,
	`reply_to_id` text,
	`edited_at` text,
	`deleted_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reply_to_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `messages_channel_created_idx` ON `messages` (`channel_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `messages_channel_id_idx` ON `messages` (`channel_id`,`id`);--> statement-breakpoint
CREATE INDEX `messages_author_id_idx` ON `messages` (`author_id`);--> statement-breakpoint
CREATE INDEX `messages_live_channel_id_idx` ON `messages` (`channel_id`,`id`) WHERE "messages"."deleted_at" is null;--> statement-breakpoint
CREATE TABLE `notification_outbox` (
	`event_id` text NOT NULL,
	`subscription_id` text NOT NULL,
	`recipient_id` text NOT NULL,
	`kind` text NOT NULL,
	`channel_id` text NOT NULL,
	`payload_json` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`available_at` text NOT NULL,
	`lease_token` text,
	`lease_until` text,
	`delivered_at` text,
	`failed_at` text,
	`last_error` text,
	`created_at` text NOT NULL,
	PRIMARY KEY(`event_id`, `subscription_id`),
	FOREIGN KEY (`subscription_id`) REFERENCES `push_subscriptions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recipient_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "notification_outbox_kind_check" CHECK("notification_outbox"."kind" in ('mention', 'dm_message', 'live_started', 'mail'))
);
--> statement-breakpoint
CREATE INDEX `notification_outbox_due_idx` ON `notification_outbox` (`available_at`) WHERE "notification_outbox"."delivered_at" is null and "notification_outbox"."failed_at" is null;--> statement-breakpoint
CREATE TABLE `auth_oauth_access_token` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`client_id` text NOT NULL,
	`session_id` text,
	`user_id` text,
	`reference_id` text,
	`authorization_code_id` text,
	`resources` text,
	`requested_user_info_claims` text,
	`refresh_id` text,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`revoked` integer,
	`confirmation` text,
	`scopes` text NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `auth_oauth_client`(`client_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`session_id`) REFERENCES `auth_sessions`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `auth_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`refresh_id`) REFERENCES `auth_oauth_refresh_token`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_oauth_access_token_token_unique` ON `auth_oauth_access_token` (`token`);--> statement-breakpoint
CREATE INDEX `auth_oauth_access_token_client_id_idx` ON `auth_oauth_access_token` (`client_id`);--> statement-breakpoint
CREATE INDEX `auth_oauth_access_token_session_id_idx` ON `auth_oauth_access_token` (`session_id`);--> statement-breakpoint
CREATE INDEX `auth_oauth_access_token_user_id_idx` ON `auth_oauth_access_token` (`user_id`);--> statement-breakpoint
CREATE INDEX `auth_oauth_access_token_authorization_code_id_idx` ON `auth_oauth_access_token` (`authorization_code_id`);--> statement-breakpoint
CREATE INDEX `auth_oauth_access_token_refresh_id_idx` ON `auth_oauth_access_token` (`refresh_id`);--> statement-breakpoint
CREATE TABLE `auth_oauth_client` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`client_secret` text,
	`client_discovery_id` text,
	`disabled` integer DEFAULT false,
	`skip_consent` integer,
	`enable_end_session` integer,
	`subject_type` text,
	`scopes` text,
	`client_credentials_scopes` text DEFAULT '[]',
	`user_id` text,
	`created_at` integer,
	`updated_at` integer,
	`name` text,
	`uri` text,
	`icon` text,
	`contacts` text,
	`tos` text,
	`policy` text,
	`software_id` text,
	`software_version` text,
	`software_statement` text,
	`redirect_uris` text NOT NULL,
	`post_logout_redirect_uris` text,
	`backchannel_logout_uri` text,
	`backchannel_logout_session_required` integer,
	`token_endpoint_auth_method` text,
	`application_type` text,
	`jwks` text,
	`jwks_uri` text,
	`grant_types` text,
	`response_types` text,
	`require_p_k_c_e` integer,
	`dpop_bound_access_tokens` integer DEFAULT false,
	`reference_id` text,
	`metadata` text,
	FOREIGN KEY (`user_id`) REFERENCES `auth_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_oauth_client_client_id_unique` ON `auth_oauth_client` (`client_id`);--> statement-breakpoint
CREATE INDEX `auth_oauth_client_user_id_idx` ON `auth_oauth_client` (`user_id`);--> statement-breakpoint
CREATE TABLE `auth_oauth_client_assertion` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `auth_oauth_client_resource` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`resource_id` text NOT NULL,
	`metadata` text,
	`created_at` integer,
	FOREIGN KEY (`client_id`) REFERENCES `auth_oauth_client`(`client_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resource_id`) REFERENCES `auth_oauth_resource`(`identifier`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `auth_oauth_client_resource_client_id_idx` ON `auth_oauth_client_resource` (`client_id`);--> statement-breakpoint
CREATE INDEX `auth_oauth_client_resource_resource_id_idx` ON `auth_oauth_client_resource` (`resource_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `auth_oauth_client_resource_client_id_resource_id_unique` ON `auth_oauth_client_resource` (`client_id`,`resource_id`);--> statement-breakpoint
CREATE TABLE `auth_oauth_consent` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`user_id` text,
	`reference_id` text,
	`resources` text,
	`requested_user_info_claims` text,
	`scopes` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `auth_oauth_client`(`client_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `auth_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `auth_oauth_consent_client_id_idx` ON `auth_oauth_consent` (`client_id`);--> statement-breakpoint
CREATE INDEX `auth_oauth_consent_user_id_idx` ON `auth_oauth_consent` (`user_id`);--> statement-breakpoint
CREATE TABLE `auth_oauth_refresh_token` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`client_id` text NOT NULL,
	`session_id` text,
	`user_id` text NOT NULL,
	`reference_id` text,
	`authorization_code_id` text,
	`resources` text,
	`requested_user_info_claims` text,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`revoked` integer,
	`rotated_at` integer,
	`rotation_replay_response` text,
	`rotation_replay_expires_at` integer,
	`auth_time` integer,
	`confirmation` text,
	`scopes` text NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `auth_oauth_client`(`client_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`session_id`) REFERENCES `auth_sessions`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `auth_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_oauth_refresh_token_token_unique` ON `auth_oauth_refresh_token` (`token`);--> statement-breakpoint
CREATE INDEX `auth_oauth_refresh_token_client_id_idx` ON `auth_oauth_refresh_token` (`client_id`);--> statement-breakpoint
CREATE INDEX `auth_oauth_refresh_token_session_id_idx` ON `auth_oauth_refresh_token` (`session_id`);--> statement-breakpoint
CREATE INDEX `auth_oauth_refresh_token_user_id_idx` ON `auth_oauth_refresh_token` (`user_id`);--> statement-breakpoint
CREATE INDEX `auth_oauth_refresh_token_authorization_code_id_idx` ON `auth_oauth_refresh_token` (`authorization_code_id`);--> statement-breakpoint
CREATE TABLE `auth_oauth_resource` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`name` text NOT NULL,
	`access_token_ttl` integer,
	`refresh_token_ttl` integer,
	`signing_algorithm` text,
	`signing_key_id` text,
	`allowed_scopes` text,
	`custom_claims` text,
	`dpop_bound_access_tokens_required` integer DEFAULT false,
	`disabled` integer DEFAULT false,
	`created_at` integer,
	`updated_at` integer,
	`policy_version` integer DEFAULT 1,
	`metadata` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_oauth_resource_identifier_unique` ON `auth_oauth_resource` (`identifier`);--> statement-breakpoint
CREATE TABLE `onboarding_acceptances` (
	`user_id` text NOT NULL,
	`revision_id` text NOT NULL,
	`accepted_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `revision_id`),
	FOREIGN KEY (`user_id`) REFERENCES `auth_users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`revision_id`) REFERENCES `onboarding_revisions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `onboarding_acceptances_revision_idx` ON `onboarding_acceptances` (`revision_id`);--> statement-breakpoint
CREATE TABLE `onboarding_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`version` integer NOT NULL,
	`privacy_json` text NOT NULL,
	`terms_json` text NOT NULL,
	`rules_json` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `auth_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `onboarding_revisions_version_unique` ON `onboarding_revisions` (`version`);--> statement-breakpoint
CREATE TABLE `project_policies` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`permissions_bitmask` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_by` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "project_policies_permissions_bitmask_check" CHECK("project_policies"."permissions_bitmask" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_policies_name_unique` ON `project_policies` (`name`);--> statement-breakpoint
CREATE TABLE `project_releases` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`repository_id` text,
	`repository` text NOT NULL,
	`tag` text NOT NULL,
	`version` text NOT NULL,
	`sha` text NOT NULL,
	`message` text DEFAULT '' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`repository_id`) REFERENCES `project_repositories`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `project_releases_project` ON `project_releases` (`project_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `project_releases_project_id_tag_unique` ON `project_releases` (`project_id`,`tag`);--> statement-breakpoint
CREATE TABLE `project_repositories` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`provider` text NOT NULL,
	`host` text NOT NULL,
	`external_id` text NOT NULL,
	`slug` text NOT NULL,
	`default_branch` text NOT NULL,
	`environment_id` text,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`environment_id`) REFERENCES `agent_environments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_repositories_environment_id_unique` ON `project_repositories` (`environment_id`);--> statement-breakpoint
CREATE INDEX `project_repositories_project` ON `project_repositories` (`project_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `project_repositories_project_id_provider_host_external_id_unique` ON `project_repositories` (`project_id`,`provider`,`host`,`external_id`);--> statement-breakpoint
CREATE TABLE `project_secrets` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`placeholder` text NOT NULL,
	`hosts_json` text DEFAULT '[]' NOT NULL,
	`secret_ciphertext` text NOT NULL,
	`secret_iv` text NOT NULL,
	`secret_version` integer DEFAULT 1 NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`last_used_at` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_secrets_project_id_name_unique` ON `project_secrets` (`project_id`,`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `project_secrets_project_id_placeholder_unique` ON `project_secrets` (`project_id`,`placeholder`);--> statement-breakpoint
CREATE TABLE `projects` (
	`space_id` text DEFAULT '00000000-0000-4000-8000-00000000000d' NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`archived_at` text,
	`version` integer DEFAULT 1 NOT NULL,
	`factory_json` text,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `projects_space_idx` ON `projects` (`space_id`);--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`user_agent` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscriptions_endpoint_unique` ON `push_subscriptions` (`endpoint`);--> statement-breakpoint
CREATE INDEX `push_subscriptions_user_id_idx` ON `push_subscriptions` (`user_id`);--> statement-breakpoint
CREATE TABLE `realtimekit_settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`account_id` text NOT NULL,
	`app_id` text NOT NULL,
	`api_token_ciphertext` text NOT NULL,
	`api_token_iv` text NOT NULL,
	`api_token_version` integer DEFAULT 1 NOT NULL,
	`host_preset` text NOT NULL,
	`participant_preset` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT "realtimekit_settings_singleton_check" CHECK("realtimekit_settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE `role_policies` (
	`role_id` text NOT NULL,
	`policy_id` text NOT NULL,
	PRIMARY KEY(`role_id`, `policy_id`),
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`policy_id`) REFERENCES `project_policies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `roles` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`permissions_bitmask` integer NOT NULL,
	`resource_access_json` text DEFAULT '{}' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`is_system` integer DEFAULT false NOT NULL,
	`mentionable` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `roles_key_unique` ON `roles` (`key`);--> statement-breakpoint
CREATE TABLE `server` (
	`id` text PRIMARY KEY NOT NULL,
	`singleton` integer DEFAULT 1 NOT NULL,
	`name` text NOT NULL,
	`icon_r2_key` text,
	`owner_id` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`id`) REFERENCES `server_identity`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "server_singleton_check" CHECK("server"."singleton" = 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `server_singleton_idx` ON `server` (`singleton`);--> statement-breakpoint
CREATE TABLE `server_domain_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`action` text NOT NULL,
	`hostname` text NOT NULL,
	`token_hash` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "server_domain_requests_action_check" CHECK("server_domain_requests"."action" IN ('add', 'remove', 'primary')),
	CONSTRAINT "server_domain_requests_status_check" CHECK("server_domain_requests"."status" IN ('pending', 'running', 'complete', 'failed'))
);
--> statement-breakpoint
CREATE INDEX `server_domain_requests_status_idx` ON `server_domain_requests` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `server_domains` (
	`origin` text PRIMARY KEY NOT NULL,
	`hostname` text NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT "server_domains_primary_check" CHECK("server_domains"."is_primary" IN (0, 1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `server_domains_hostname_unique` ON `server_domains` (`hostname`);--> statement-breakpoint
CREATE UNIQUE INDEX `server_domains_single_primary` ON `server_domains` (`is_primary`) WHERE "server_domains"."is_primary" = 1;--> statement-breakpoint
CREATE TABLE `server_identity` (
	`singleton` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	CONSTRAINT "server_identity_singleton_check" CHECK("server_identity"."singleton" = 1),
	CONSTRAINT "server_identity_uuid_check" CHECK(length("server_identity"."id") = 36 AND substr("server_identity"."id",15,1) = '4' AND substr("server_identity"."id",20,1) IN ('8','9','a','b'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `server_identity_singleton_unique` ON `server_identity` (`singleton`);--> statement-breakpoint
CREATE TABLE `server_schema` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`version` text NOT NULL,
	CONSTRAINT "server_schema_id_check" CHECK("server_schema"."id" = 1),
	CONSTRAINT "server_schema_version_check" CHECK("server_schema"."version" = 'server-v2')
);
--> statement-breakpoint
CREATE TABLE `server_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `server_setup` (
	`singleton` integer PRIMARY KEY NOT NULL,
	`username` text,
	`token_hash` text NOT NULL,
	`server_name` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "server_setup_singleton_check" CHECK("server_setup"."singleton" = 1)
);
--> statement-breakpoint
CREATE TABLE `server_update_control` (
	`id` integer PRIMARY KEY NOT NULL,
	`revision` integer NOT NULL,
	`payload` text NOT NULL,
	CONSTRAINT "server_update_control_singleton" CHECK("server_update_control"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE `space_members` (
	`space_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`joined_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	PRIMARY KEY(`space_id`, `user_id`),
	FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "space_members_role_check" CHECK("space_members"."role" IN ('member', 'admin'))
);
--> statement-breakpoint
CREATE INDEX `space_members_user_idx` ON `space_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `space_stats` (
	`space_id` text PRIMARY KEY NOT NULL,
	`people` integer DEFAULT 0 NOT NULL,
	`projects` integer DEFAULT 0 NOT NULL,
	`tasks` integer DEFAULT 0 NOT NULL,
	`recordings` integer DEFAULT 0 NOT NULL,
	`storage_bytes` integer DEFAULT 0 NOT NULL,
	`messages` integer DEFAULT 0 NOT NULL,
	`last_activity_at` text,
	`refreshed_at` text NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `space_task_counters` (
	`space_id` text PRIMARY KEY NOT NULL,
	`last` integer NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `space_usage` (
	`space_id` text NOT NULL,
	`metric` text NOT NULL,
	`period` text NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`space_id`, `metric`, `period`),
	FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "space_usage_metric_check" CHECK("space_usage"."metric" IN ('runs', 'emails', 'voice'))
);
--> statement-breakpoint
CREATE TABLE `spaces` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`storage_limit_bytes` integer,
	`member_limit` integer,
	`agent_limit` integer,
	`monthly_run_limit` integer,
	`monthly_email_limit` integer,
	`monthly_voice_limit` integer,
	`suspended_at` text,
	`action_limits_json` text DEFAULT '{}' NOT NULL,
	`created_by` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `spaces_one_default` ON `spaces` (`is_default`) WHERE "spaces"."is_default" = 1;--> statement-breakpoint
CREATE TABLE `task_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`uploader_id` text NOT NULL,
	`r2_key` text NOT NULL,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`width` integer,
	`height` integer,
	`created_at` text NOT NULL,
	`role` text DEFAULT 'file' NOT NULL,
	`source_id` text,
	`marks_json` text,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploader_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_id`) REFERENCES `task_attachments`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "task_attachments_size_check" CHECK("task_attachments"."size_bytes" > 0),
	CONSTRAINT "task_attachments_role_check" CHECK("task_attachments"."role" in ('file', 'recording', 'frame'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `task_attachments_r2_key_unique` ON `task_attachments` (`r2_key`);--> statement-breakpoint
CREATE INDEX `task_attachments_task_created_idx` ON `task_attachments` (`task_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `task_attachments_source_idx` ON `task_attachments` (`source_id`);--> statement-breakpoint
CREATE TABLE `task_boards` (
	`space_id` text DEFAULT '00000000-0000-4000-8000-00000000000d' NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_by` text NOT NULL,
	`archived_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `task_boards_position_idx` ON `task_boards` (`position`);--> statement-breakpoint
CREATE INDEX `task_boards_space_idx` ON `task_boards` (`space_id`);--> statement-breakpoint
CREATE TABLE `task_checklist_items` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`title` text NOT NULL,
	`completed` integer DEFAULT false NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `task_checklist_items_task_position_idx` ON `task_checklist_items` (`task_id`,`position`);--> statement-breakpoint
CREATE TABLE `task_dependencies` (
	`task_id` text NOT NULL,
	`depends_on_task_id` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`task_id`, `depends_on_task_id`),
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`depends_on_task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "task_dependencies_not_self_check" CHECK("task_dependencies"."task_id" <> "task_dependencies"."depends_on_task_id")
);
--> statement-breakpoint
CREATE INDEX `task_dependencies_depends_on_idx` ON `task_dependencies` (`depends_on_task_id`);--> statement-breakpoint
CREATE TABLE `task_label_links` (
	`task_id` text NOT NULL,
	`label_id` text NOT NULL,
	PRIMARY KEY(`task_id`, `label_id`),
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`label_id`) REFERENCES `task_labels`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `task_label_links_label_idx` ON `task_label_links` (`label_id`);--> statement-breakpoint
CREATE TABLE `task_labels` (
	`id` text PRIMARY KEY NOT NULL,
	`board_id` text NOT NULL,
	`name` text NOT NULL,
	`color` text DEFAULT 'neutral' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`board_id`) REFERENCES `task_boards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `task_labels_board_name_unique` ON `task_labels` (`board_id`,`name`);--> statement-breakpoint
CREATE INDEX `task_labels_board_position_idx` ON `task_labels` (`board_id`,`position`);--> statement-breakpoint
CREATE TABLE `task_numbers` (
	`task_id` text PRIMARY KEY NOT NULL,
	`number` integer NOT NULL,
	`space_id` text NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `task_numbers_space_number_unique` ON `task_numbers` (`space_id`,`number`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`parent_task_id` text,
	`project_id` text,
	`id` text PRIMARY KEY NOT NULL,
	`board_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'backlog' NOT NULL,
	`priority` text DEFAULT 'normal' NOT NULL,
	`due_at` text,
	`position` integer DEFAULT 0 NOT NULL,
	`assignee_id` text,
	`environment_id` text,
	`factory_state` text,
	`channel_id` text,
	`discussion_channel_id` text,
	`created_by` text NOT NULL,
	`result_summary` text,
	`result_details` text,
	`last_error` text,
	`archived_at` text,
	`source_channel_id` text,
	`source_message_id` text,
	`cover_attachment_id` text,
	`pull_url` text,
	`preview_url` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`parent_task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`board_id`) REFERENCES `task_boards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assignee_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`environment_id`) REFERENCES `agent_environments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`discussion_channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cover_attachment_id`) REFERENCES `task_attachments`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "tasks_status_check" CHECK("tasks"."status" in ('backlog', 'ready', 'review', 'done', 'failed')),
	CONSTRAINT "tasks_priority_check" CHECK("tasks"."priority" in ('low', 'normal', 'high', 'urgent'))
);
--> statement-breakpoint
CREATE INDEX `tasks_parent_idx` ON `tasks` (`parent_task_id`);--> statement-breakpoint
CREATE INDEX `tasks_board_status_position_idx` ON `tasks` (`board_id`,`status`,`position`);--> statement-breakpoint
CREATE INDEX `tasks_assignee_id_idx` ON `tasks` (`assignee_id`);--> statement-breakpoint
CREATE INDEX `tasks_source_message_idx` ON `tasks` (`source_channel_id`,`source_message_id`) WHERE "tasks"."source_message_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `tasks_discussion_channel_unique` ON `tasks` (`discussion_channel_id`) WHERE "tasks"."discussion_channel_id" is not null;--> statement-breakpoint
CREATE INDEX `tasks_project` ON `tasks` (`project_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text DEFAULT 'human' NOT NULL,
	`handle` text,
	`display_name` text NOT NULL,
	`avatar_r2_key` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`role_id` text,
	`nickname` text,
	`joined_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "users_kind_check" CHECK("users"."kind" in ('human', 'agent')),
	CONSTRAINT "users_status_check" CHECK("users"."status" in ('pending', 'active', 'removed')),
	CONSTRAINT "users_active_role_check" CHECK("users"."status" <> 'active' or ("users"."role_id" is not null and "users"."joined_at" is not null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_handle_unique` ON `users` (`handle`);--> statement-breakpoint
CREATE INDEX `users_status_idx` ON `users` (`status`);--> statement-breakpoint
CREATE INDEX `users_kind_idx` ON `users` (`kind`);--> statement-breakpoint
CREATE INDEX `users_role_id_idx` ON `users` (`role_id`);--> statement-breakpoint
-- Hand-written part of the unreleased Server baseline: search, triggers and seed rows.
-- scripts/regenerate-baseline.mjs appends it after the tables drizzle-kit generates from drizzle/schema.ts.
--> statement-breakpoint
CREATE VIRTUAL TABLE `message_search` USING fts5( `message_id` UNINDEXED, `content`, tokenize = 'unicode61 remove_diacritics 2' );
--> statement-breakpoint
CREATE TRIGGER `message_search_after_delete` AFTER DELETE ON `messages` BEGIN DELETE FROM `message_search` WHERE `message_id` = OLD.`id`; END;
--> statement-breakpoint
CREATE TRIGGER `message_search_after_insert` AFTER INSERT ON `messages` WHEN NEW.`deleted_at` IS NULL AND length(trim(NEW.`content`)) > 0 BEGIN INSERT INTO `message_search` (`message_id`, `content`) VALUES (NEW.`id`, NEW.`content`); END;
--> statement-breakpoint
CREATE TRIGGER `message_search_after_update` AFTER UPDATE OF `content`, `deleted_at` ON `messages` BEGIN DELETE FROM `message_search` WHERE `message_id` = OLD.`id`; INSERT INTO `message_search` (`message_id`, `content`) SELECT NEW.`id`, NEW.`content` WHERE NEW.`deleted_at` IS NULL AND length(trim(NEW.`content`)) > 0; END;
--> statement-breakpoint
CREATE TRIGGER agents_pi_only_insert AFTER INSERT ON agents WHEN NEW.harness <> 'pi' BEGIN UPDATE agents SET harness='pi' WHERE user_id=NEW.user_id; END;
--> statement-breakpoint
CREATE TRIGGER channel_member_read_baseline AFTER INSERT ON channel_members BEGIN INSERT INTO channel_reads(channel_id,user_id,last_read_message_id,updated_at) SELECT c.id,NEW.user_id,MAX(m.id),NEW.joined_at FROM channels c JOIN messages m ON m.channel_id=c.id WHERE c.id=NEW.channel_id OR c.parent_id=NEW.channel_id GROUP BY c.id ON CONFLICT(channel_id,user_id) DO UPDATE SET last_read_message_id=excluded.last_read_message_id; END;
--> statement-breakpoint
CREATE TRIGGER member_read_baseline_insert AFTER INSERT ON users WHEN NEW.status='active' BEGIN INSERT OR IGNORE INTO channel_reads(channel_id,user_id,last_read_message_id,updated_at) SELECT c.id,NEW.id,MAX(m.id),NEW.updated_at FROM channels c JOIN messages m ON m.channel_id=c.id LEFT JOIN channels parent ON parent.id=c.parent_id WHERE COALESCE(parent.visibility,c.visibility)='server' AND m.created_at<=COALESCE(NEW.joined_at,NEW.created_at) GROUP BY c.id; END;
--> statement-breakpoint
CREATE TRIGGER member_read_baseline_activate AFTER UPDATE OF status ON users WHEN NEW.status='active' AND OLD.status<>'active' BEGIN INSERT INTO channel_reads(channel_id,user_id,last_read_message_id,updated_at) SELECT c.id,NEW.id,MAX(m.id),NEW.updated_at FROM channels c JOIN messages m ON m.channel_id=c.id LEFT JOIN channels parent ON parent.id=c.parent_id WHERE COALESCE(parent.visibility,c.visibility)='server' AND m.created_at<=COALESCE(NEW.joined_at,NEW.created_at) GROUP BY c.id ON CONFLICT(channel_id,user_id) DO UPDATE SET last_read_message_id=excluded.last_read_message_id; END;
--> statement-breakpoint
CREATE TRIGGER role_policy_insert AFTER INSERT ON role_policies BEGIN UPDATE roles SET permissions_bitmask = (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 1) <> 0) THEN 1 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 2) <> 0) THEN 2 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 4) <> 0) THEN 4 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 8) <> 0) THEN 8 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 16) <> 0) THEN 16 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 32) <> 0) THEN 32 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 64) <> 0) THEN 64 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 128) <> 0) THEN 128 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 256) <> 0) THEN 256 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 512) <> 0) THEN 512 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 1024) <> 0) THEN 1024 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 2048) <> 0) THEN 2048 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 4096) <> 0) THEN 4096 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 8192) <> 0) THEN 8192 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 16384) <> 0) THEN 16384 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 32768) <> 0) THEN 32768 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 65536) <> 0) THEN 65536 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 131072) <> 0) THEN 131072 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 262144) <> 0) THEN 262144 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 524288) <> 0) THEN 524288 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 1048576) <> 0) THEN 1048576 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 2097152) <> 0) THEN 2097152 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 4194304) <> 0) THEN 4194304 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 8388608) <> 0) THEN 8388608 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 16777216) <> 0) THEN 16777216 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 33554432) <> 0) THEN 33554432 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 67108864) <> 0) THEN 67108864 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 134217728) <> 0) THEN 134217728 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 268435456) <> 0) THEN 268435456 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 536870912) <> 0) THEN 536870912 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 1073741824) <> 0) THEN 1073741824 ELSE 0 END) WHERE id=NEW.role_id; END;
--> statement-breakpoint
CREATE TRIGGER role_policy_delete AFTER DELETE ON role_policies BEGIN UPDATE roles SET permissions_bitmask = (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 1) <> 0) THEN 1 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 2) <> 0) THEN 2 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 4) <> 0) THEN 4 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 8) <> 0) THEN 8 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 16) <> 0) THEN 16 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 32) <> 0) THEN 32 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 64) <> 0) THEN 64 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 128) <> 0) THEN 128 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 256) <> 0) THEN 256 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 512) <> 0) THEN 512 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 1024) <> 0) THEN 1024 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 2048) <> 0) THEN 2048 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 4096) <> 0) THEN 4096 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 8192) <> 0) THEN 8192 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 16384) <> 0) THEN 16384 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 32768) <> 0) THEN 32768 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 65536) <> 0) THEN 65536 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 131072) <> 0) THEN 131072 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 262144) <> 0) THEN 262144 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 524288) <> 0) THEN 524288 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 1048576) <> 0) THEN 1048576 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 2097152) <> 0) THEN 2097152 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 4194304) <> 0) THEN 4194304 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 8388608) <> 0) THEN 8388608 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 16777216) <> 0) THEN 16777216 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 33554432) <> 0) THEN 33554432 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 67108864) <> 0) THEN 67108864 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 134217728) <> 0) THEN 134217728 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 268435456) <> 0) THEN 268435456 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 536870912) <> 0) THEN 536870912 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 1073741824) <> 0) THEN 1073741824 ELSE 0 END) WHERE id=OLD.role_id; END;
--> statement-breakpoint
CREATE TRIGGER role_policy_update AFTER UPDATE OF permissions_bitmask ON project_policies BEGIN UPDATE roles SET permissions_bitmask = (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 1) <> 0) THEN 1 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 2) <> 0) THEN 2 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 4) <> 0) THEN 4 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 8) <> 0) THEN 8 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 16) <> 0) THEN 16 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 32) <> 0) THEN 32 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 64) <> 0) THEN 64 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 128) <> 0) THEN 128 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 256) <> 0) THEN 256 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 512) <> 0) THEN 512 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 1024) <> 0) THEN 1024 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 2048) <> 0) THEN 2048 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 4096) <> 0) THEN 4096 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 8192) <> 0) THEN 8192 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 16384) <> 0) THEN 16384 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 32768) <> 0) THEN 32768 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 65536) <> 0) THEN 65536 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 131072) <> 0) THEN 131072 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 262144) <> 0) THEN 262144 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 524288) <> 0) THEN 524288 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 1048576) <> 0) THEN 1048576 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 2097152) <> 0) THEN 2097152 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 4194304) <> 0) THEN 4194304 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 8388608) <> 0) THEN 8388608 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 16777216) <> 0) THEN 16777216 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 33554432) <> 0) THEN 33554432 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 67108864) <> 0) THEN 67108864 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 134217728) <> 0) THEN 134217728 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 268435456) <> 0) THEN 268435456 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 536870912) <> 0) THEN 536870912 ELSE 0 END) + (CASE WHEN EXISTS (SELECT 1 FROM role_policies rp JOIN project_policies p ON p.id=rp.policy_id WHERE rp.role_id=roles.id AND (p.permissions_bitmask & 1073741824) <> 0) THEN 1073741824 ELSE 0 END) WHERE id IN (SELECT role_id FROM role_policies WHERE policy_id=NEW.id); END;
--> statement-breakpoint
CREATE TRIGGER role_default_policy AFTER INSERT ON roles WHEN NEW.key IN ('owner','admin','member') BEGIN INSERT INTO role_policies(role_id,policy_id) VALUES (NEW.id, CASE NEW.key WHEN 'owner' THEN 'server-policy-owner' WHEN 'admin' THEN 'server-policy-admin' ELSE 'server-policy-member' END); END;
--> statement-breakpoint
CREATE TRIGGER `database_default_view_after_insert` AFTER INSERT ON `database_definitions` BEGIN INSERT INTO `database_views` (`id`, `database_id`, `name`, `layout`, `position`, `created_by`, `created_at`, `updated_at`) VALUES ('default:' || NEW.`id`, NEW.`id`, 'All records', 'table', 1024, NEW.`created_by`, NEW.`created_at`, NEW.`updated_at`); END;
--> statement-breakpoint
CREATE TRIGGER users_join_default_space_on_insert AFTER INSERT ON users WHEN NEW.status = 'active' BEGIN INSERT OR IGNORE INTO space_members(space_id, user_id) VALUES ('00000000-0000-4000-8000-00000000000d', NEW.id); END;
--> statement-breakpoint
CREATE TRIGGER users_join_default_space_on_activate AFTER UPDATE OF status ON users WHEN NEW.status = 'active' AND OLD.status <> 'active' BEGIN INSERT OR IGNORE INTO space_members(space_id, user_id) VALUES ('00000000-0000-4000-8000-00000000000d', NEW.id); END;
--> statement-breakpoint
CREATE TRIGGER users_leave_spaces_on_removal AFTER UPDATE OF status ON users WHEN NEW.status <> 'active' AND OLD.status = 'active' BEGIN DELETE FROM space_members WHERE user_id = NEW.id; END;
--> statement-breakpoint
CREATE TRIGGER channels_thread_inherits_space AFTER INSERT ON channels WHEN NEW.parent_id IS NOT NULL BEGIN UPDATE channels SET space_id = (SELECT space_id FROM channels WHERE id = NEW.parent_id),
    section = (SELECT section FROM channels WHERE id = NEW.parent_id) WHERE id = NEW.id; END;
--> statement-breakpoint
CREATE TRIGGER `tasks_assign_number_after_insert` AFTER INSERT ON `tasks` WHEN NOT EXISTS (SELECT 1 FROM `task_numbers` WHERE `task_id` = NEW.`id`) BEGIN INSERT INTO `space_task_counters` (`space_id`, `last`) SELECT `space_id`, 1 FROM `task_boards` WHERE `id` = NEW.`board_id` ON CONFLICT (`space_id`) DO UPDATE SET `last` = `last` + 1; INSERT INTO `task_numbers` (`task_id`, `number`, `space_id`) SELECT NEW.`id`, `c`.`last`, `c`.`space_id` FROM `space_task_counters` `c` JOIN `task_boards` `b` ON `b`.`space_id` = `c`.`space_id` WHERE `b`.`id` = NEW.`board_id`; END;
--> statement-breakpoint
CREATE TRIGGER tasks_hierarchy_insert BEFORE INSERT ON tasks BEGIN SELECT RAISE(ABORT, 'task_hierarchy_boundary') WHERE NEW.parent_task_id IS NOT NULL AND NOT EXISTS ( SELECT 1 FROM tasks p WHERE p.id=NEW.parent_task_id AND p.board_id=NEW.board_id AND p.project_id IS NEW.project_id ); SELECT RAISE(ABORT, 'task_hierarchy_cycle') WHERE NEW.parent_task_id IS NOT NULL AND EXISTS ( WITH RECURSIVE ancestors(id) AS ( SELECT NEW.parent_task_id UNION SELECT t.parent_task_id FROM tasks t JOIN ancestors a ON t.id=a.id WHERE t.parent_task_id IS NOT NULL ) SELECT 1 FROM ancestors WHERE id=NEW.id ); SELECT RAISE(ABORT, 'task_hierarchy_archived') WHERE EXISTS ( SELECT 1 FROM tasks p WHERE p.id=NEW.parent_task_id AND p.archived_at IS NOT NULL ); END;
--> statement-breakpoint
CREATE TRIGGER tasks_hierarchy_update BEFORE UPDATE OF parent_task_id, board_id, project_id ON tasks BEGIN SELECT RAISE(ABORT, 'task_hierarchy_boundary') WHERE NEW.parent_task_id IS NOT NULL AND NOT EXISTS ( SELECT 1 FROM tasks p WHERE p.id=NEW.parent_task_id AND p.board_id=NEW.board_id AND p.project_id IS NEW.project_id ); SELECT RAISE(ABORT, 'task_hierarchy_cycle') WHERE NEW.parent_task_id IS NOT NULL AND EXISTS ( WITH RECURSIVE ancestors(id) AS ( SELECT NEW.parent_task_id UNION SELECT t.parent_task_id FROM tasks t JOIN ancestors a ON t.id=a.id WHERE t.parent_task_id IS NOT NULL ) SELECT 1 FROM ancestors WHERE id=NEW.id ); SELECT RAISE(ABORT, 'task_hierarchy_children') WHERE EXISTS ( SELECT 1 FROM tasks c WHERE c.parent_task_id=NEW.id AND (c.board_id<>NEW.board_id OR c.project_id IS NOT NEW.project_id) ); SELECT RAISE(ABORT, 'task_hierarchy_archived') WHERE NEW.parent_task_id IS NOT OLD.parent_task_id AND EXISTS ( SELECT 1 FROM tasks p WHERE p.id=NEW.parent_task_id AND p.archived_at IS NOT NULL ); END;
--> statement-breakpoint
CREATE TRIGGER email_mailboxes_are_sources AFTER INSERT ON email_mailboxes
BEGIN
  UPDATE channels SET section = 'customers' WHERE id = NEW.channel_id;
  INSERT OR IGNORE INTO customer_sources(channel_id, kind) VALUES (NEW.channel_id, 'mailbox');
END;
--> statement-breakpoint
CREATE TRIGGER customer_widgets_are_sources BEFORE INSERT ON customer_widgets
BEGIN
  UPDATE channels SET section = 'customers' WHERE id = NEW.channel_id;
  INSERT OR IGNORE INTO customer_sources(channel_id, kind) VALUES (NEW.channel_id, 'widget');
END;
--> statement-breakpoint
CREATE TRIGGER audit_log_finds_space AFTER INSERT ON audit_log WHEN NEW.space_id IS NULL AND NEW.target_type NOT IN ('server', 'user', 'role', 'policy', 'ai_function', 'agent_provider', 'onboarding_revision', 'git_connection', 'mcp_connection') BEGIN UPDATE audit_log SET space_id = COALESCE(CASE NEW.target_type WHEN 'space' THEN NEW.target_id WHEN 'channel' THEN (SELECT space_id FROM channels WHERE id = NEW.target_id) WHEN 'mailbox' THEN (SELECT space_id FROM channels WHERE id = NEW.target_id) WHEN 'email_thread' THEN (SELECT space_id FROM channels WHERE id = NEW.target_id) WHEN 'channel_category' THEN (SELECT space_id FROM channel_categories WHERE id = NEW.target_id) WHEN 'message' THEN (SELECT c.space_id FROM messages m JOIN channels c ON c.id = m.channel_id WHERE m.id = NEW.target_id) WHEN 'project' THEN (SELECT space_id FROM projects WHERE id = NEW.target_id) WHEN 'task_board' THEN (SELECT space_id FROM task_boards WHERE id = NEW.target_id) WHEN 'task' THEN (SELECT b.space_id FROM tasks t JOIN task_boards b ON b.id = t.board_id WHERE t.id = NEW.target_id) WHEN 'task_label' THEN (SELECT b.space_id FROM task_labels l JOIN task_boards b ON b.id = l.board_id WHERE l.id = NEW.target_id) WHEN 'database' THEN (SELECT space_id FROM database_definitions WHERE id = NEW.target_id) WHEN 'database_item' THEN (SELECT d.space_id FROM data_items i JOIN database_definitions d ON d.id = i.database_id WHERE i.id = NEW.target_id) WHEN 'database_field' THEN (SELECT d.space_id FROM database_fields f JOIN database_definitions d ON d.id = f.database_id WHERE f.id = NEW.target_id) WHEN 'database_view' THEN (SELECT d.space_id FROM database_views v JOIN database_definitions d ON d.id = v.database_id WHERE v.id = NEW.target_id) WHEN 'item' THEN (SELECT space_id FROM data_items WHERE id = NEW.target_id) WHEN 'document' THEN (SELECT space_id FROM data_items WHERE id = NEW.target_id) WHEN 'canvas' THEN (SELECT space_id FROM data_items WHERE id = NEW.target_id) WHEN 'canvas_node' THEN (SELECT c.space_id FROM canvas_nodes n JOIN data_items c ON c.id = n.canvas_id WHERE n.id = NEW.target_id) WHEN 'canvas_edge' THEN (SELECT c.space_id FROM canvas_edges e JOIN data_items c ON c.id = e.canvas_id WHERE e.id = NEW.target_id) WHEN 'gadget' THEN (SELECT space_id FROM gadgets WHERE id = NEW.target_id) WHEN 'tool_connection' THEN (SELECT space_id FROM mcp_outbound_connections WHERE id = NEW.target_id) WHEN 'environment' THEN (SELECT space_id FROM agent_environments WHERE id = NEW.target_id) WHEN 'invite' THEN (SELECT space_id FROM invites WHERE code = NEW.target_id) WHEN 'run' THEN (SELECT c.space_id FROM agent_runs r JOIN channels c ON c.id = r.channel_id WHERE r.id = NEW.target_id) WHEN 'agent' THEN (SELECT space_id FROM space_members WHERE user_id = NEW.target_id LIMIT 1) WHEN 'mcp_token' THEN (SELECT m.space_id FROM mcp_access_tokens t JOIN space_members m ON m.user_id = t.subject_id WHERE t.id = NEW.target_id LIMIT 1) WHEN 'customer_contact' THEN (SELECT space_id FROM customer_contacts WHERE id = NEW.target_id) WHEN 'customer_company' THEN (SELECT space_id FROM customer_companies WHERE id = NEW.target_id) WHEN 'customer_conversation' THEN (SELECT space_id FROM channels WHERE id = NEW.target_id) WHEN 'customer_widget' THEN (SELECT space_id FROM channels WHERE id = NEW.target_id) END, (SELECT MIN(space_id) FROM space_members WHERE user_id = NEW.actor_id HAVING COUNT(*) = 1)) WHERE id = NEW.id; END;
--> statement-breakpoint
CREATE TRIGGER document_revision_before_update BEFORE UPDATE OF title, content ON data_items WHEN OLD.title <> NEW.title OR OLD.content <> NEW.content BEGIN INSERT INTO document_revisions(document_id,version,title,content,saved_at) VALUES(OLD.id,OLD.version,OLD.title,OLD.content,OLD.updated_at); DELETE FROM document_revisions WHERE document_id=OLD.id AND version NOT IN (SELECT version FROM document_revisions WHERE document_id=OLD.id ORDER BY version DESC LIMIT 50); END;
--> statement-breakpoint
CREATE TRIGGER data_item_cleanup AFTER DELETE ON data_items BEGIN DELETE FROM data_bookmarks WHERE target_id=OLD.id AND target_type='item'; DELETE FROM data_references WHERE (source_type IN ('item','record','document','canvas') AND source_id=OLD.id) OR (target_type IN ('item','record','document','canvas') AND target_id=OLD.id); END;
--> statement-breakpoint
CREATE TRIGGER data_item_insert_scope BEFORE INSERT ON data_items BEGIN SELECT CASE WHEN NEW.database_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM database_definitions d WHERE d.id=NEW.database_id AND d.space_id=NEW.space_id AND d.deleted_at IS NULL AND d.archived_at IS NULL) THEN RAISE(ABORT,'item_database_scope') END; SELECT CASE WHEN NEW.parent_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM data_items p WHERE p.id=NEW.parent_id AND p.space_id=NEW.space_id AND p.deleted_at IS NULL) THEN RAISE(ABORT,'item_parent_scope') END; SELECT CASE WHEN NEW.parent_id IS NOT NULL AND EXISTS(WITH RECURSIVE ancestors(id,parent_id) AS (SELECT id,parent_id FROM data_items WHERE id=NEW.parent_id UNION SELECT p.id,p.parent_id FROM data_items p JOIN ancestors a ON p.id=a.parent_id) SELECT 1 FROM ancestors WHERE id=NEW.id) THEN RAISE(ABORT,'item_parent_cycle') END; END;
--> statement-breakpoint
CREATE TRIGGER data_item_move_scope BEFORE UPDATE OF parent_id,database_id,space_id,kind ON data_items BEGIN SELECT CASE WHEN NEW.database_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM database_definitions d WHERE d.id=NEW.database_id AND d.space_id=NEW.space_id AND d.deleted_at IS NULL AND d.archived_at IS NULL) THEN RAISE(ABORT,'item_database_scope') END; SELECT CASE WHEN NEW.parent_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM data_items p WHERE p.id=NEW.parent_id AND p.space_id=NEW.space_id AND p.deleted_at IS NULL) THEN RAISE(ABORT,'item_parent_scope') END; SELECT CASE WHEN NEW.parent_id IS NOT NULL AND EXISTS(WITH RECURSIVE ancestors(id,parent_id) AS (SELECT id,parent_id FROM data_items WHERE id=NEW.parent_id UNION SELECT p.id,p.parent_id FROM data_items p JOIN ancestors a ON p.id=a.parent_id) SELECT 1 FROM ancestors WHERE id=NEW.id) THEN RAISE(ABORT,'item_parent_cycle') END; END;
--> statement-breakpoint
CREATE TRIGGER data_item_identity BEFORE UPDATE OF space_id,kind ON data_items WHEN OLD.space_id<>NEW.space_id OR OLD.kind<>NEW.kind BEGIN SELECT RAISE(ABORT,'item_identity_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER canvas_nodes_item_insert BEFORE INSERT ON canvas_nodes WHEN NOT EXISTS(SELECT 1 FROM data_items WHERE id=NEW.canvas_id AND kind='canvas' AND deleted_at IS NULL) BEGIN SELECT RAISE(ABORT,'canvas_item_required'); END;
--> statement-breakpoint
CREATE TRIGGER canvas_edges_item_insert BEFORE INSERT ON canvas_edges WHEN NOT EXISTS(SELECT 1 FROM data_items WHERE id=NEW.canvas_id AND kind='canvas' AND deleted_at IS NULL) BEGIN SELECT RAISE(ABORT,'canvas_item_required'); END;
--> statement-breakpoint
CREATE TRIGGER canvas_nodes_item_update BEFORE UPDATE OF canvas_id ON canvas_nodes WHEN NOT EXISTS(SELECT 1 FROM data_items WHERE id=NEW.canvas_id AND kind='canvas' AND deleted_at IS NULL) BEGIN SELECT RAISE(ABORT,'canvas_item_required'); END;
--> statement-breakpoint
CREATE TRIGGER canvas_edges_item_update BEFORE UPDATE OF canvas_id ON canvas_edges WHEN NOT EXISTS(SELECT 1 FROM data_items WHERE id=NEW.canvas_id AND kind='canvas' AND deleted_at IS NULL) BEGIN SELECT RAISE(ABORT,'canvas_item_required'); END;
--> statement-breakpoint
CREATE TRIGGER data_references_database_delete AFTER DELETE ON database_definitions BEGIN DELETE FROM data_references WHERE (source_type='database' AND source_id=OLD.id) OR (target_type='database' AND target_id=OLD.id); END;
--> statement-breakpoint
CREATE TRIGGER data_references_task_delete AFTER DELETE ON tasks BEGIN DELETE FROM data_references WHERE (source_type='task' AND source_id=OLD.id) OR (target_type='task' AND target_id=OLD.id); END;
--> statement-breakpoint
CREATE TRIGGER database_view_bookmarks_after_delete AFTER DELETE ON database_views BEGIN DELETE FROM data_bookmarks WHERE target_type='database_view' AND target_id=OLD.id; END;
--> statement-breakpoint
INSERT INTO `server_schema` (`id`, `version`) VALUES (1, 'server-v2');
--> statement-breakpoint
INSERT INTO `spaces` (`id`, `name`, `description`, `is_default`, `storage_limit_bytes`, `member_limit`, `agent_limit`, `monthly_run_limit`, `monthly_email_limit`, `action_limits_json`, `created_by`, `created_at`, `updated_at`, `monthly_voice_limit`, `suspended_at`) VALUES ('00000000-0000-4000-8000-00000000000d', 'General', '', 1, NULL, NULL, NULL, NULL, NULL, '{}', NULL, '2026-11-17T12:41:58.490Z', '2026-11-17T12:41:58.490Z', NULL, NULL);
--> statement-breakpoint
INSERT INTO `project_policies` (`id`, `name`, `description`, `permissions_bitmask`, `version`, `created_by`, `created_at`, `updated_at`) VALUES ('project-policy-developer', 'Developer', 'Work on assigned project tasks and propose code changes.', 94085120, 1, NULL, '2026-10-28T13:21:58.351Z', '2026-10-28T13:21:58.351Z');
--> statement-breakpoint
INSERT INTO `project_policies` (`id`, `name`, `description`, `permissions_bitmask`, `version`, `created_by`, `created_at`, `updated_at`) VALUES ('project-policy-reviewer', 'Reviewer', 'Read project tasks and inspect code in an isolated workspace. Does not grant code publication or task editing.', 76259328, 1, NULL, '2026-10-28T13:21:58.351Z', '2026-10-28T13:21:58.351Z');
--> statement-breakpoint
INSERT INTO `project_policies` (`id`, `name`, `description`, `permissions_bitmask`, `version`, `created_by`, `created_at`, `updated_at`) VALUES ('project-policy-coordinator', 'Coordinator', 'Read and organize project tasks and invoke agents. Does not grant computer access or code publication.', 68689920, 1, NULL, '2026-10-28T13:21:58.351Z', '2026-10-28T13:21:58.351Z');
--> statement-breakpoint
INSERT INTO `project_policies` (`id`, `name`, `description`, `permissions_bitmask`, `version`, `created_by`, `created_at`, `updated_at`) VALUES ('project-policy-task-coordinator', 'Task coordinator', 'Organize project tasks and delegate work to agents. Does not grant computer access or code publication.', 337190912, 1, NULL, '2026-10-28T13:21:58.351Z', '2026-10-28T13:21:58.351Z');
--> statement-breakpoint
INSERT INTO `project_policies` (`id`, `name`, `description`, `permissions_bitmask`, `version`, `created_by`, `created_at`, `updated_at`) VALUES ('server-policy-owner', 'Server owner', 'All server permissions.', 2147483647, 1, NULL, '2026-10-28T13:21:58.352Z', '2026-10-28T13:21:58.352Z');
--> statement-breakpoint
INSERT INTO `project_policies` (`id`, `name`, `description`, `permissions_bitmask`, `version`, `created_by`, `created_at`, `updated_at`) VALUES ('server-policy-admin', 'Server administrator', 'Manage the server.', 2130243583, 1, NULL, '2026-10-28T13:21:58.352Z', '2026-10-28T13:21:58.352Z');
--> statement-breakpoint
INSERT INTO `project_policies` (`id`, `name`, `description`, `permissions_bitmask`, `version`, `created_by`, `created_at`, `updated_at`) VALUES ('server-policy-member', 'Server member', 'Participate in server conversations.', 112, 1, NULL, '2026-10-28T13:21:58.352Z', '2026-10-28T13:21:58.352Z');
