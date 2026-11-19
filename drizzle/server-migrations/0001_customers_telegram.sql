-- Written by scripts/generate-migration.mjs from drizzle/schema.ts. Rerun it; do not edit.
-- Changed: agent_run_publications, agent_run_tools, agent_runs, agent_schedules, agent_tool_decisions, agent_turns, agents, auth_provider_credentials, auth_settings, canvas_nodes, channel_attention, channels, customer_contact_companies, customer_conversations, customer_identities, customer_sources, customer_widget_messages, data_bookmarks, data_items, data_references, database_fields, database_views, email_messages, factory_approvals, factory_boxes, git_setup_requests, mail_drafts, notification_outbox, server_domain_requests, space_members, space_usage, task_attachments, tasks, users
-- Rebuilt with them, as they reference them: agent_code_proposals, agent_environments, agent_model_calls, agent_run_deliveries, agent_run_events, agent_schedule_occurrences, agent_sessions, agent_webhooks, attachments, audit_log, canvas_edges, channel_members, channel_reads, channel_role_denies, compute_nodes, compute_pairings, customer_companies, customer_company_domains, customer_contacts, customer_visitors, customer_widgets, data_record_requests, database_definitions, database_item_links, document_revisions, email_mailboxes, email_threads, gadget_versions, gadgets, git_connections, grants, invites, mcp_access_tokens, mcp_oauth_connections, mcp_outbound_connections, message_mentions, message_pins, message_reactions, messages, project_policies, project_releases, project_repositories, project_secrets, projects, push_subscriptions, role_policies, server, space_stats, space_task_counters, spaces, task_boards, task_checklist_items, task_dependencies, task_label_links, task_labels, task_numbers
-- New: customer_telegram_bots, customer_telegram_messages
PRAGMA defer_foreign_keys = on;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `message_search_after_delete`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `message_search_after_insert`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `message_search_after_update`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `agents_pi_only_insert`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `channel_member_read_baseline`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `member_read_baseline_insert`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `member_read_baseline_activate`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `role_policy_insert`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `role_policy_delete`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `role_policy_update`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `role_default_policy`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `database_default_view_after_insert`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `users_join_default_space_on_insert`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `users_join_default_space_on_activate`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `users_leave_spaces_on_removal`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `channels_thread_inherits_space`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `tasks_assign_number_after_insert`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `tasks_hierarchy_insert`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `tasks_hierarchy_update`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `email_mailboxes_are_sources`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `customer_widgets_are_sources`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `audit_log_finds_space`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `document_revision_before_update`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `data_item_cleanup`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `data_item_insert_scope`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `data_item_move_scope`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `data_item_identity`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `canvas_nodes_item_insert`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `canvas_edges_item_insert`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `canvas_nodes_item_update`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `canvas_edges_item_update`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `data_references_database_delete`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `data_references_task_delete`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `database_view_bookmarks_after_delete`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_users` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `users`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_agent_environments` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `agent_environments`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_channels` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `channels`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_messages` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `messages`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_task_attachments` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `task_attachments`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_task_boards` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `task_boards`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_projects` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `projects`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_tasks` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `tasks`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_agents` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `agents`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_agent_sessions` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `agent_sessions`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_agent_runs` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `agent_runs`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_agent_code_proposals` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `agent_code_proposals`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_agent_model_calls` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `agent_model_calls`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_agent_run_deliveries` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `agent_run_deliveries`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_agent_run_events` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `agent_run_events`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_agent_run_publications` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `agent_run_publications`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_agent_run_tools` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `agent_run_tools`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_agent_schedules` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `agent_schedules`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_agent_schedule_occurrences` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `agent_schedule_occurrences`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_agent_tool_decisions` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `agent_tool_decisions`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_agent_turns` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `agent_turns`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_agent_webhooks` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `agent_webhooks`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_attachments` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `attachments`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_audit_log` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `audit_log`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_auth_provider_credentials` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `auth_provider_credentials`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_auth_settings` AS SELECT * FROM `auth_settings`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_database_definitions` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `database_definitions`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_data_items` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `data_items`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_canvas_nodes` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `canvas_nodes`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_canvas_edges` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `canvas_edges`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_channel_attention` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `channel_attention`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_channel_members` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `channel_members`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_channel_reads` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `channel_reads`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_channel_role_denies` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `channel_role_denies`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_compute_nodes` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `compute_nodes`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_compute_pairings` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `compute_pairings`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_customer_companies` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `customer_companies`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_customer_company_domains` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `customer_company_domains`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_customer_contacts` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `customer_contacts`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_customer_contact_companies` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `customer_contact_companies`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_customer_identities` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `customer_identities`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_customer_sources` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `customer_sources`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_customer_conversations` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `customer_conversations`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_customer_widgets` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `customer_widgets`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_customer_visitors` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `customer_visitors`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_customer_widget_messages` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `customer_widget_messages`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_data_bookmarks` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `data_bookmarks`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_data_record_requests` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `data_record_requests`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_data_references` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `data_references`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_database_fields` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `database_fields`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_database_item_links` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `database_item_links`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_database_views` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `database_views`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_document_revisions` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `document_revisions`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_email_mailboxes` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `email_mailboxes`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_email_threads` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `email_threads`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_email_messages` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `email_messages`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_factory_boxes` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `factory_boxes`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_factory_approvals` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `factory_approvals`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_gadgets` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `gadgets`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_gadget_versions` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `gadget_versions`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_git_connections` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `git_connections`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_git_setup_requests` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `git_setup_requests`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_server` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `server`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_mcp_outbound_connections` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `mcp_outbound_connections`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_project_policies` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `project_policies`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_grants` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `grants`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_invites` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `invites`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_mail_drafts` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `mail_drafts`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_spaces` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `spaces`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_mcp_access_tokens` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `mcp_access_tokens`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_mcp_oauth_connections` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `mcp_oauth_connections`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_message_mentions` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `message_mentions`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_message_pins` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `message_pins`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_message_reactions` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `message_reactions`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_push_subscriptions` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `push_subscriptions`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_notification_outbox` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `notification_outbox`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_project_repositories` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `project_repositories`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_project_releases` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `project_releases`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_project_secrets` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `project_secrets`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_role_policies` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `role_policies`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_server_domain_requests` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `server_domain_requests`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_space_members` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `space_members`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_space_stats` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `space_stats`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_space_task_counters` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `space_task_counters`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_space_usage` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `space_usage`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_task_checklist_items` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `task_checklist_items`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_task_dependencies` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `task_dependencies`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_task_labels` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `task_labels`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_task_label_links` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `task_label_links`;
--> statement-breakpoint
CREATE TABLE `zugoid_keep_task_numbers` AS SELECT rowid AS `zugoid_keep_rowid`, * FROM `task_numbers`;
--> statement-breakpoint
DELETE FROM `agent_code_proposals`;
--> statement-breakpoint
DELETE FROM `agent_model_calls`;
--> statement-breakpoint
DELETE FROM `agent_run_deliveries`;
--> statement-breakpoint
DELETE FROM `agent_run_events`;
--> statement-breakpoint
DELETE FROM `agent_run_publications`;
--> statement-breakpoint
DELETE FROM `agent_run_tools`;
--> statement-breakpoint
DELETE FROM `agent_schedule_occurrences`;
--> statement-breakpoint
DELETE FROM `agent_schedules`;
--> statement-breakpoint
DELETE FROM `agent_tool_decisions`;
--> statement-breakpoint
DELETE FROM `agent_turns`;
--> statement-breakpoint
DELETE FROM `agent_webhooks`;
--> statement-breakpoint
DELETE FROM `attachments`;
--> statement-breakpoint
DELETE FROM `audit_log`;
--> statement-breakpoint
DELETE FROM `auth_provider_credentials`;
--> statement-breakpoint
DELETE FROM `auth_settings`;
--> statement-breakpoint
DELETE FROM `canvas_edges`;
--> statement-breakpoint
DELETE FROM `canvas_nodes`;
--> statement-breakpoint
DELETE FROM `channel_attention`;
--> statement-breakpoint
DELETE FROM `channel_members`;
--> statement-breakpoint
DELETE FROM `channel_reads`;
--> statement-breakpoint
DELETE FROM `channel_role_denies`;
--> statement-breakpoint
DELETE FROM `compute_pairings`;
--> statement-breakpoint
DELETE FROM `customer_company_domains`;
--> statement-breakpoint
DELETE FROM `customer_contact_companies`;
--> statement-breakpoint
DELETE FROM `customer_companies`;
--> statement-breakpoint
DELETE FROM `customer_visitors`;
--> statement-breakpoint
DELETE FROM `customer_widget_messages`;
--> statement-breakpoint
DELETE FROM `customer_widgets`;
--> statement-breakpoint
DELETE FROM `data_bookmarks`;
--> statement-breakpoint
DELETE FROM `data_record_requests`;
--> statement-breakpoint
DELETE FROM `data_references`;
--> statement-breakpoint
DELETE FROM `database_item_links`;
--> statement-breakpoint
DELETE FROM `database_fields`;
--> statement-breakpoint
DELETE FROM `database_views`;
--> statement-breakpoint
DELETE FROM `document_revisions`;
--> statement-breakpoint
DELETE FROM `data_items`;
--> statement-breakpoint
DELETE FROM `database_definitions`;
--> statement-breakpoint
DELETE FROM `email_messages`;
--> statement-breakpoint
DELETE FROM `factory_approvals`;
--> statement-breakpoint
DELETE FROM `factory_boxes`;
--> statement-breakpoint
DELETE FROM `agent_runs`;
--> statement-breakpoint
DELETE FROM `agent_sessions`;
--> statement-breakpoint
DELETE FROM `compute_nodes`;
--> statement-breakpoint
DELETE FROM `git_connections`;
--> statement-breakpoint
DELETE FROM `git_setup_requests`;
--> statement-breakpoint
DELETE FROM `grants`;
--> statement-breakpoint
DELETE FROM `agents`;
--> statement-breakpoint
DELETE FROM `gadget_versions`;
--> statement-breakpoint
DELETE FROM `gadgets`;
--> statement-breakpoint
DELETE FROM `invites`;
--> statement-breakpoint
DELETE FROM `mail_drafts`;
--> statement-breakpoint
DELETE FROM `email_threads`;
--> statement-breakpoint
DELETE FROM `customer_conversations`;
--> statement-breakpoint
DELETE FROM `customer_identities`;
--> statement-breakpoint
DELETE FROM `customer_contacts`;
--> statement-breakpoint
DELETE FROM `customer_sources`;
--> statement-breakpoint
DELETE FROM `email_mailboxes`;
--> statement-breakpoint
DELETE FROM `mcp_access_tokens`;
--> statement-breakpoint
DELETE FROM `mcp_oauth_connections`;
--> statement-breakpoint
DELETE FROM `mcp_outbound_connections`;
--> statement-breakpoint
DELETE FROM `message_mentions`;
--> statement-breakpoint
DELETE FROM `message_pins`;
--> statement-breakpoint
DELETE FROM `message_reactions`;
--> statement-breakpoint
DELETE FROM `notification_outbox`;
--> statement-breakpoint
DELETE FROM `project_releases`;
--> statement-breakpoint
DELETE FROM `project_repositories`;
--> statement-breakpoint
DELETE FROM `project_secrets`;
--> statement-breakpoint
DELETE FROM `push_subscriptions`;
--> statement-breakpoint
DELETE FROM `role_policies`;
--> statement-breakpoint
DELETE FROM `project_policies`;
--> statement-breakpoint
DELETE FROM `server`;
--> statement-breakpoint
DELETE FROM `server_domain_requests`;
--> statement-breakpoint
DELETE FROM `space_members`;
--> statement-breakpoint
DELETE FROM `space_stats`;
--> statement-breakpoint
DELETE FROM `space_task_counters`;
--> statement-breakpoint
DELETE FROM `space_usage`;
--> statement-breakpoint
DELETE FROM `task_checklist_items`;
--> statement-breakpoint
DELETE FROM `task_dependencies`;
--> statement-breakpoint
DELETE FROM `task_label_links`;
--> statement-breakpoint
DELETE FROM `task_labels`;
--> statement-breakpoint
DELETE FROM `task_numbers`;
--> statement-breakpoint
DELETE FROM `spaces`;
--> statement-breakpoint
DELETE FROM `channels`;
--> statement-breakpoint
DELETE FROM `messages`;
--> statement-breakpoint
DELETE FROM `task_attachments`;
--> statement-breakpoint
DELETE FROM `tasks`;
--> statement-breakpoint
DELETE FROM `agent_environments`;
--> statement-breakpoint
DELETE FROM `projects`;
--> statement-breakpoint
DELETE FROM `task_boards`;
--> statement-breakpoint
DELETE FROM `users`;
--> statement-breakpoint
DROP TABLE `agent_code_proposals`;
--> statement-breakpoint
DROP TABLE `agent_model_calls`;
--> statement-breakpoint
DROP TABLE `agent_run_deliveries`;
--> statement-breakpoint
DROP TABLE `agent_run_events`;
--> statement-breakpoint
DROP TABLE `agent_run_publications`;
--> statement-breakpoint
DROP TABLE `agent_run_tools`;
--> statement-breakpoint
DROP TABLE `agent_schedule_occurrences`;
--> statement-breakpoint
DROP TABLE `agent_schedules`;
--> statement-breakpoint
DROP TABLE `agent_tool_decisions`;
--> statement-breakpoint
DROP TABLE `agent_turns`;
--> statement-breakpoint
DROP TABLE `agent_webhooks`;
--> statement-breakpoint
DROP TABLE `attachments`;
--> statement-breakpoint
DROP TABLE `audit_log`;
--> statement-breakpoint
DROP TABLE `auth_provider_credentials`;
--> statement-breakpoint
DROP TABLE `auth_settings`;
--> statement-breakpoint
DROP TABLE `canvas_edges`;
--> statement-breakpoint
DROP TABLE `canvas_nodes`;
--> statement-breakpoint
DROP TABLE `channel_attention`;
--> statement-breakpoint
DROP TABLE `channel_members`;
--> statement-breakpoint
DROP TABLE `channel_reads`;
--> statement-breakpoint
DROP TABLE `channel_role_denies`;
--> statement-breakpoint
DROP TABLE `compute_pairings`;
--> statement-breakpoint
DROP TABLE `customer_company_domains`;
--> statement-breakpoint
DROP TABLE `customer_contact_companies`;
--> statement-breakpoint
DROP TABLE `customer_companies`;
--> statement-breakpoint
DROP TABLE `customer_visitors`;
--> statement-breakpoint
DROP TABLE `customer_widget_messages`;
--> statement-breakpoint
DROP TABLE `customer_widgets`;
--> statement-breakpoint
DROP TABLE `data_bookmarks`;
--> statement-breakpoint
DROP TABLE `data_record_requests`;
--> statement-breakpoint
DROP TABLE `data_references`;
--> statement-breakpoint
DROP TABLE `database_item_links`;
--> statement-breakpoint
DROP TABLE `database_fields`;
--> statement-breakpoint
DROP TABLE `database_views`;
--> statement-breakpoint
DROP TABLE `document_revisions`;
--> statement-breakpoint
DROP TABLE `data_items`;
--> statement-breakpoint
DROP TABLE `database_definitions`;
--> statement-breakpoint
DROP TABLE `email_messages`;
--> statement-breakpoint
DROP TABLE `factory_approvals`;
--> statement-breakpoint
DROP TABLE `factory_boxes`;
--> statement-breakpoint
DROP TABLE `agent_runs`;
--> statement-breakpoint
DROP TABLE `agent_sessions`;
--> statement-breakpoint
DROP TABLE `compute_nodes`;
--> statement-breakpoint
DROP TABLE `git_connections`;
--> statement-breakpoint
DROP TABLE `git_setup_requests`;
--> statement-breakpoint
DROP TABLE `grants`;
--> statement-breakpoint
DROP TABLE `agents`;
--> statement-breakpoint
DROP TABLE `gadget_versions`;
--> statement-breakpoint
DROP TABLE `gadgets`;
--> statement-breakpoint
DROP TABLE `invites`;
--> statement-breakpoint
DROP TABLE `mail_drafts`;
--> statement-breakpoint
DROP TABLE `email_threads`;
--> statement-breakpoint
DROP TABLE `customer_conversations`;
--> statement-breakpoint
DROP TABLE `customer_identities`;
--> statement-breakpoint
DROP TABLE `customer_contacts`;
--> statement-breakpoint
DROP TABLE `customer_sources`;
--> statement-breakpoint
DROP TABLE `email_mailboxes`;
--> statement-breakpoint
DROP TABLE `mcp_access_tokens`;
--> statement-breakpoint
DROP TABLE `mcp_oauth_connections`;
--> statement-breakpoint
DROP TABLE `mcp_outbound_connections`;
--> statement-breakpoint
DROP TABLE `message_mentions`;
--> statement-breakpoint
DROP TABLE `message_pins`;
--> statement-breakpoint
DROP TABLE `message_reactions`;
--> statement-breakpoint
DROP TABLE `notification_outbox`;
--> statement-breakpoint
DROP TABLE `project_releases`;
--> statement-breakpoint
DROP TABLE `project_repositories`;
--> statement-breakpoint
DROP TABLE `project_secrets`;
--> statement-breakpoint
DROP TABLE `push_subscriptions`;
--> statement-breakpoint
DROP TABLE `role_policies`;
--> statement-breakpoint
DROP TABLE `project_policies`;
--> statement-breakpoint
DROP TABLE `server`;
--> statement-breakpoint
DROP TABLE `server_domain_requests`;
--> statement-breakpoint
DROP TABLE `space_members`;
--> statement-breakpoint
DROP TABLE `space_stats`;
--> statement-breakpoint
DROP TABLE `space_task_counters`;
--> statement-breakpoint
DROP TABLE `space_usage`;
--> statement-breakpoint
DROP TABLE `task_checklist_items`;
--> statement-breakpoint
DROP TABLE `task_dependencies`;
--> statement-breakpoint
DROP TABLE `task_label_links`;
--> statement-breakpoint
DROP TABLE `task_labels`;
--> statement-breakpoint
DROP TABLE `task_numbers`;
--> statement-breakpoint
DROP TABLE `spaces`;
--> statement-breakpoint
DROP TABLE `channels`;
--> statement-breakpoint
DROP TABLE `messages`;
--> statement-breakpoint
DROP TABLE `task_attachments`;
--> statement-breakpoint
DROP TABLE `tasks`;
--> statement-breakpoint
DROP TABLE `agent_environments`;
--> statement-breakpoint
DROP TABLE `projects`;
--> statement-breakpoint
DROP TABLE `task_boards`;
--> statement-breakpoint
DROP TABLE `users`;
--> statement-breakpoint
CREATE TABLE `users` ( `id` text PRIMARY KEY NOT NULL, `kind` text DEFAULT 'human' NOT NULL, `handle` text, `display_name` text NOT NULL, `avatar_r2_key` text, `status` text DEFAULT 'pending' NOT NULL, `role_id` text, `nickname` text, `joined_at` text, `created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL, `updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL, FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE no action, CONSTRAINT "users_active_role_check" CHECK("users"."status" <> 'active' or ("users"."role_id" is not null and "users"."joined_at" is not null)) );
--> statement-breakpoint
CREATE TABLE `agent_environments` ( `id` text PRIMARY KEY NOT NULL, `config_json` text NOT NULL, `enabled` integer DEFAULT true NOT NULL, `version` integer DEFAULT 1 NOT NULL, `created_by` text NOT NULL, `created_at` text NOT NULL, `updated_at` text NOT NULL, `space_id` text DEFAULT '00000000-0000-4000-8000-00000000000d' NOT NULL, FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action );
--> statement-breakpoint
CREATE TABLE `channels` ( `space_id` text DEFAULT '00000000-0000-4000-8000-00000000000d' NOT NULL, `id` text PRIMARY KEY NOT NULL, `name` text NOT NULL, `topic` text DEFAULT '' NOT NULL, `type` text NOT NULL, `section` text DEFAULT 'chat' NOT NULL, `visibility` text DEFAULT 'server' NOT NULL, `category_id` text, `position` integer DEFAULT 0 NOT NULL, `created_by` text, `dm_kind` text DEFAULT 'pair' NOT NULL, `dm_owner_id` text, `dm_pair_key` text, `live_meeting_id` text, `archived_at` text, `archived_by` text, `parent_id` text, `parent_message_id` text, `created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL, `updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL, FOREIGN KEY (`category_id`) REFERENCES `channel_categories`(`id`) ON UPDATE no action ON DELETE set null, FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null, FOREIGN KEY (`dm_owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null, FOREIGN KEY (`archived_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null, FOREIGN KEY (`parent_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`parent_message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade, CONSTRAINT "channels_dm_private_check" CHECK("channels"."type" <> 'dm' or "channels"."visibility" = 'private'), CONSTRAINT "channels_thread_parent_check" CHECK( ("channels"."type" = 'thread' and "channels"."parent_id" is not null and "channels"."parent_message_id" is not null) or ("channels"."type" = 'conversation' and "channels"."parent_id" is not null and "channels"."parent_message_id" is null) or ("channels"."type" not in ('thread', 'conversation') and "channels"."parent_id" is null and "channels"."parent_message_id" is null) ), CONSTRAINT "channels_conversation_section_check" CHECK("channels"."type" <> 'conversation' or "channels"."section" = 'customers') );
--> statement-breakpoint
CREATE TABLE `messages` ( `id` text PRIMARY KEY NOT NULL, `channel_id` text NOT NULL, `author_id` text NOT NULL, `content` text NOT NULL, `reply_to_id` text, `edited_at` text, `deleted_at` text, `created_at` text NOT NULL, FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action, FOREIGN KEY (`reply_to_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE set null );
--> statement-breakpoint
CREATE TABLE `task_attachments` ( `id` text PRIMARY KEY NOT NULL, `task_id` text NOT NULL, `uploader_id` text NOT NULL, `r2_key` text NOT NULL, `filename` text NOT NULL, `content_type` text NOT NULL, `size_bytes` integer NOT NULL, `width` integer, `height` integer, `created_at` text NOT NULL, `role` text DEFAULT 'file' NOT NULL, `source_id` text, `marks_json` text, FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`uploader_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action, FOREIGN KEY (`source_id`) REFERENCES `task_attachments`(`id`) ON UPDATE no action ON DELETE cascade, CONSTRAINT "task_attachments_size_check" CHECK("task_attachments"."size_bytes" > 0) );
--> statement-breakpoint
CREATE TABLE `task_boards` ( `space_id` text DEFAULT '00000000-0000-4000-8000-00000000000d' NOT NULL, `id` text PRIMARY KEY NOT NULL, `name` text NOT NULL, `position` integer DEFAULT 0 NOT NULL, `created_by` text NOT NULL, `archived_at` text, `created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL, `updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL, FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action );
--> statement-breakpoint
CREATE TABLE `projects` ( `space_id` text DEFAULT '00000000-0000-4000-8000-00000000000d' NOT NULL, `id` text PRIMARY KEY NOT NULL, `name` text NOT NULL, `description` text DEFAULT '' NOT NULL, `archived_at` text, `version` integer DEFAULT 1 NOT NULL, `factory_json` text, `created_by` text NOT NULL, `created_at` text NOT NULL, `updated_at` text NOT NULL, FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action );
--> statement-breakpoint
CREATE TABLE `tasks` ( `parent_task_id` text, `project_id` text, `id` text PRIMARY KEY NOT NULL, `board_id` text NOT NULL, `title` text NOT NULL, `description` text DEFAULT '' NOT NULL, `status` text DEFAULT 'backlog' NOT NULL, `priority` text DEFAULT 'normal' NOT NULL, `due_at` text, `position` integer DEFAULT 0 NOT NULL, `assignee_id` text, `environment_id` text, `factory_state` text, `channel_id` text, `discussion_channel_id` text, `created_by` text NOT NULL, `result_summary` text, `result_details` text, `last_error` text, `archived_at` text, `source_channel_id` text, `source_message_id` text, `cover_attachment_id` text, `pull_url` text, `preview_url` text, `created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL, `updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL, FOREIGN KEY (`parent_task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE set null, FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action, FOREIGN KEY (`board_id`) REFERENCES `task_boards`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`assignee_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null, FOREIGN KEY (`environment_id`) REFERENCES `agent_environments`(`id`) ON UPDATE no action ON DELETE no action, FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE set null, FOREIGN KEY (`discussion_channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE set null, FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action, FOREIGN KEY (`cover_attachment_id`) REFERENCES `task_attachments`(`id`) ON UPDATE no action ON DELETE set null );
--> statement-breakpoint
CREATE TABLE `agents` ( `harness` text DEFAULT 'pi' NOT NULL, `user_id` text PRIMARY KEY NOT NULL, `model` text DEFAULT '@cf/moonshotai/kimi-k2.7-code' NOT NULL, `instructions` text DEFAULT '' NOT NULL, `status` text DEFAULT 'active' NOT NULL, `access` text DEFAULT 'open' NOT NULL, `created_by` text NOT NULL, `last_active_at` text, `archived_at` text, `archived_by` text, `created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL, `updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL, FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action );
--> statement-breakpoint
CREATE TABLE `agent_sessions` ( `id` text PRIMARY KEY NOT NULL, `agent_id` text NOT NULL, `channel_id` text NOT NULL, `active_run_id` text, `transcript_key` text, `created_at` text NOT NULL, `updated_at` text NOT NULL, `untrusted_at` text, FOREIGN KEY (`agent_id`) REFERENCES `agents`(`user_id`) ON UPDATE no action ON DELETE no action, FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE no action );
--> statement-breakpoint
CREATE TABLE `agent_runs` ( `id` text PRIMARY KEY NOT NULL, `private_at` text, `session_id` text NOT NULL, `agent_id` text NOT NULL, `channel_id` text NOT NULL, `initiated_by` text NOT NULL, `task_id` text, `source_message_id` text, `idempotency_key` text NOT NULL, `status` text NOT NULL, `prompt` text NOT NULL, `model` text NOT NULL, `instructions` text NOT NULL, `mandate_json` text NOT NULL, `result_text` text, `result_message_id` text, `last_error` text, `model_calls` integer DEFAULT 0 NOT NULL, `total_tokens` integer DEFAULT 0 NOT NULL, `event_cursor` integer DEFAULT 0 NOT NULL, `deadline` text NOT NULL, `created_at` text NOT NULL, `updated_at` text NOT NULL, `environment_json` text, `files_key` text, `task_edit_at` text, FOREIGN KEY (`session_id`) REFERENCES `agent_sessions`(`id`) ON UPDATE no action ON DELETE no action, FOREIGN KEY (`agent_id`) REFERENCES `agents`(`user_id`) ON UPDATE no action ON DELETE no action, FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE no action, FOREIGN KEY (`initiated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action, FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action, FOREIGN KEY (`source_message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE no action );
--> statement-breakpoint
CREATE TABLE `agent_code_proposals` ( `run_id` text PRIMARY KEY NOT NULL, `environment_id` text NOT NULL, `input_hash` text NOT NULL, `branch` text NOT NULL, `commit_sha` text, `published_commit_sha` text, `pull_number` integer, `lease_until` text, `lease_token` text, `status` text DEFAULT 'pending' NOT NULL, `created_at` text NOT NULL, `updated_at` text NOT NULL, FOREIGN KEY (`run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE no action, FOREIGN KEY (`environment_id`) REFERENCES `agent_environments`(`id`) ON UPDATE no action ON DELETE no action );
--> statement-breakpoint
CREATE TABLE `agent_model_calls` ( `run_id` text NOT NULL, `call_number` integer NOT NULL, `model` text NOT NULL, `status` text NOT NULL, `started_at` text NOT NULL, `completed_at` text, `total_tokens` integer, `error` text, PRIMARY KEY(`run_id`, `call_number`), FOREIGN KEY (`run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE cascade );
--> statement-breakpoint
CREATE TABLE `agent_run_deliveries` ( `run_id` text PRIMARY KEY NOT NULL, `task_status` text DEFAULT 'pending' NOT NULL, `task_error` text, `report_status` text DEFAULT 'pending' NOT NULL, `report_error` text, `attempts` integer DEFAULT 0 NOT NULL, `updated_at` text NOT NULL, FOREIGN KEY (`run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE cascade );
--> statement-breakpoint
CREATE TABLE `agent_run_events` ( `run_id` text NOT NULL, `sequence` integer NOT NULL, `event_json` text NOT NULL, `created_at` text NOT NULL, PRIMARY KEY(`run_id`, `sequence`), FOREIGN KEY (`run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE cascade );
--> statement-breakpoint
CREATE TABLE `agent_run_publications` ( `id` text PRIMARY KEY NOT NULL, `run_id` text NOT NULL, `digest` text NOT NULL, `payload_json` text NOT NULL, `status` text NOT NULL, `message_id` text NOT NULL, `created_at` text NOT NULL, `expires_at` text NOT NULL, `decided_at` text, `decided_by` text, `completed_at` text, FOREIGN KEY (`run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`decided_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action );
--> statement-breakpoint
CREATE TABLE `agent_run_tools` ( `run_id` text NOT NULL, `call_id` text NOT NULL, `name` text NOT NULL, `arguments_json` text NOT NULL, `policy_json` text DEFAULT '' NOT NULL, `status` text NOT NULL, `result_json` text, `created_at` text NOT NULL, PRIMARY KEY(`run_id`, `call_id`), FOREIGN KEY (`run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE cascade );
--> statement-breakpoint
CREATE TABLE `agent_schedules` ( `id` text PRIMARY KEY NOT NULL, `principal_id` text NOT NULL, `created_by` text NOT NULL, `channel_id` text NOT NULL, `kind` text NOT NULL, `content` text NOT NULL, `agent_id` text, `task_id` text, `first_at` text NOT NULL, `timezone` text NOT NULL, `recurrence` text NOT NULL, `next_at` text, `status` text NOT NULL, `last_error` text, `authorization_json` text NOT NULL, `mandate_json` text, `created_at` text NOT NULL, `paused_at` text, `dismissed_at` text, `last_error_code` text, FOREIGN KEY (`principal_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action, FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action, FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE no action, FOREIGN KEY (`agent_id`) REFERENCES `agents`(`user_id`) ON UPDATE no action ON DELETE no action, FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action );
--> statement-breakpoint
CREATE TABLE `agent_schedule_occurrences` ( `schedule_id` text NOT NULL, `due_at` text NOT NULL, `message_id` text NOT NULL, `run_id` text, `completed_at` text, `attempts` integer DEFAULT 0 NOT NULL, `failed_at` text, `last_error` text, PRIMARY KEY(`schedule_id`, `due_at`), FOREIGN KEY (`schedule_id`) REFERENCES `agent_schedules`(`id`) ON UPDATE no action ON DELETE no action, FOREIGN KEY (`run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE no action );
--> statement-breakpoint
CREATE TABLE `agent_tool_decisions` ( `run_id` text NOT NULL, `call_id` text NOT NULL, `tool` text NOT NULL, `effect` text NOT NULL, `untrusted_context` integer NOT NULL, `decision` text NOT NULL, `reason` text NOT NULL, `created_at` text NOT NULL, PRIMARY KEY(`run_id`, `call_id`), FOREIGN KEY (`run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE cascade, CONSTRAINT "agent_tool_decisions_untrusted_context_check" CHECK("agent_tool_decisions"."untrusted_context" IN (0,1)) );
--> statement-breakpoint
CREATE TABLE `agent_turns` ( `submission_id` text PRIMARY KEY NOT NULL, `agent_id` text NOT NULL, `channel_id` text NOT NULL, `source_message_id` text NOT NULL, `initiated_by` text NOT NULL, `request_id` text, `status` text DEFAULT 'queued' NOT NULL, `detail` text, `approval_json` text, `created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL, `updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL, FOREIGN KEY (`agent_id`) REFERENCES `agents`(`user_id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`source_message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`initiated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action );
--> statement-breakpoint
CREATE TABLE `agent_webhooks` ( `agent_id` text PRIMARY KEY NOT NULL, `url` text NOT NULL, `header_name` text DEFAULT 'Authorization' NOT NULL, `credential_json` text, `reply_timeout_minutes` integer DEFAULT 20 NOT NULL, `created_by` text NOT NULL, `created_at` text NOT NULL, `updated_at` text NOT NULL, FOREIGN KEY (`agent_id`) REFERENCES `agents`(`user_id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action, CONSTRAINT "agent_webhooks_reply_timeout_minutes_check" CHECK("agent_webhooks"."reply_timeout_minutes" BETWEEN 2 AND 120) );
--> statement-breakpoint
CREATE TABLE `attachments` ( `id` text PRIMARY KEY NOT NULL, `message_id` text, `channel_id` text NOT NULL, `uploader_id` text NOT NULL, `r2_key` text NOT NULL, `filename` text NOT NULL, `content_type` text NOT NULL, `size_bytes` integer NOT NULL, `width` integer, `height` integer, `created_at` text NOT NULL, FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`uploader_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action, CONSTRAINT "attachments_size_check" CHECK("attachments"."size_bytes" > 0) );
--> statement-breakpoint
CREATE TABLE `audit_log` ( `space_id` text, `id` text PRIMARY KEY NOT NULL, `actor_id` text NOT NULL, `action` text NOT NULL, `target_type` text NOT NULL, `target_id` text NOT NULL, `meta_json` text DEFAULT '{}' NOT NULL, `created_at` text NOT NULL, FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action );
--> statement-breakpoint
CREATE TABLE `auth_provider_credentials` ( `provider` text PRIMARY KEY NOT NULL, `public_key` text NOT NULL, `secret_ciphertext` text NOT NULL, `secret_iv` text NOT NULL, `secret_version` integer DEFAULT 1 NOT NULL, `created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL, `updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL );
--> statement-breakpoint
CREATE TABLE `auth_settings` ( `id` integer PRIMARY KEY DEFAULT 1 NOT NULL, `registration_mode` text DEFAULT 'invite_only' NOT NULL, `password_enabled` integer DEFAULT true NOT NULL, `github_enabled` integer DEFAULT false NOT NULL, `google_enabled` integer DEFAULT false NOT NULL, `linkedin_enabled` integer DEFAULT false NOT NULL, `twitter_enabled` integer DEFAULT false NOT NULL, `turnstile_enabled` integer DEFAULT false NOT NULL, `email_from` text, `email_from_name` text, `created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL, `updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL, CONSTRAINT "auth_settings_singleton_check" CHECK("auth_settings"."id" = 1) );
--> statement-breakpoint
CREATE TABLE `database_definitions` ( `space_id` text DEFAULT '00000000-0000-4000-8000-00000000000d' NOT NULL, `id` text PRIMARY KEY NOT NULL, `deleted_at` text, `name` text NOT NULL, `position` integer DEFAULT 0 NOT NULL, `created_by` text NOT NULL, `archived_at` text, `created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL, `updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL, FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action );
--> statement-breakpoint
CREATE TABLE `data_items` ( `id` text PRIMARY KEY NOT NULL, `space_id` text DEFAULT '00000000-0000-4000-8000-00000000000d' NOT NULL, `kind` text DEFAULT 'page' NOT NULL, `parent_id` text, `content` text DEFAULT '' NOT NULL, `icon` text, `deleted_at` text, `mutation_id` text, `database_id` text, `title` text NOT NULL, `position` integer DEFAULT 0 NOT NULL, `version` integer DEFAULT 1 NOT NULL, `created_by` text NOT NULL, `text_1` text, `text_2` text, `text_3` text, `text_4` text, `text_5` text, `text_6` text, `text_7` text, `text_8` text, `text_9` text, `text_10` text, `text_11` text, `text_12` text, `text_13` text, `text_14` text, `text_15` text, `text_16` text, `number_1` real, `number_2` real, `number_3` real, `number_4` real, `number_5` real, `number_6` real, `number_7` real, `number_8` real, `boolean_1` integer, `boolean_2` integer, `boolean_3` integer, `boolean_4` integer, `boolean_5` integer, `boolean_6` integer, `boolean_7` integer, `boolean_8` integer, `date_1` text, `date_2` text, `date_3` text, `date_4` text, `date_5` text, `date_6` text, `date_7` text, `date_8` text, `select_1` text, `select_2` text, `select_3` text, `select_4` text, `select_5` text, `select_6` text, `select_7` text, `select_8` text, `created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL, `updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL, FOREIGN KEY (`parent_id`) REFERENCES `data_items`(`id`) ON UPDATE no action ON DELETE restrict, FOREIGN KEY (`database_id`) REFERENCES `database_definitions`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action, CONSTRAINT "database_items_version_check" CHECK("data_items"."version" > 0) );
--> statement-breakpoint
CREATE TABLE `canvas_nodes` ( `id` text PRIMARY KEY NOT NULL, `canvas_id` text NOT NULL, `kind` text DEFAULT 'note' NOT NULL, `content` text DEFAULT '' NOT NULL, `x` real DEFAULT 0 NOT NULL, `y` real DEFAULT 0 NOT NULL, `width` real DEFAULT 240 NOT NULL, `height` real DEFAULT 144 NOT NULL, `color` text DEFAULT 'neutral' NOT NULL, `version` integer DEFAULT 1 NOT NULL, `created_by` text NOT NULL, `created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL, `updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL, FOREIGN KEY (`canvas_id`) REFERENCES `data_items`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action, CONSTRAINT "canvas_nodes_version_check" CHECK("canvas_nodes"."version" > 0) );
--> statement-breakpoint
CREATE TABLE `canvas_edges` ( `id` text PRIMARY KEY NOT NULL, `canvas_id` text NOT NULL, `from_node_id` text NOT NULL, `to_node_id` text NOT NULL, `created_by` text NOT NULL, `created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL, FOREIGN KEY (`canvas_id`) REFERENCES `data_items`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`from_node_id`) REFERENCES `canvas_nodes`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`to_node_id`) REFERENCES `canvas_nodes`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action, CONSTRAINT "canvas_edges_not_self_check" CHECK("canvas_edges"."from_node_id" <> "canvas_edges"."to_node_id") );
--> statement-breakpoint
CREATE TABLE `channel_attention` ( `channel_id` text NOT NULL, `user_id` text NOT NULL, `following` integer DEFAULT false NOT NULL, `notifications` text DEFAULT 'default' NOT NULL, `read_generation` integer DEFAULT 0 NOT NULL, PRIMARY KEY(`channel_id`, `user_id`), FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade );
--> statement-breakpoint
CREATE TABLE `channel_members` ( `channel_id` text NOT NULL, `user_id` text NOT NULL, `hidden_at` text, `joined_at` text NOT NULL, PRIMARY KEY(`channel_id`, `user_id`), FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade );
--> statement-breakpoint
CREATE TABLE `channel_reads` ( `channel_id` text NOT NULL, `user_id` text NOT NULL, `last_read_message_id` text, `updated_at` text NOT NULL, PRIMARY KEY(`channel_id`, `user_id`), FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`last_read_message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE set null );
--> statement-breakpoint
CREATE TABLE `channel_role_denies` ( `channel_id` text NOT NULL, `role_id` text NOT NULL, `deny_mask` integer NOT NULL, `created_at` text NOT NULL, PRIMARY KEY(`channel_id`, `role_id`), FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE cascade, CONSTRAINT "channel_role_denies_mask_check" CHECK("channel_role_denies"."deny_mask" > 0 and ("channel_role_denies"."deny_mask" & ~112) = 0) );
--> statement-breakpoint
CREATE TABLE `compute_nodes` ( `id` text PRIMARY KEY NOT NULL, `name` text NOT NULL, `token_hash` text NOT NULL, `enabled` integer DEFAULT true NOT NULL, `capabilities_json` text DEFAULT '{}' NOT NULL, `last_seen` text, `created_by` text NOT NULL, `created_at` text NOT NULL, FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action );
--> statement-breakpoint
CREATE TABLE `compute_pairings` ( `token_hash` text PRIMARY KEY NOT NULL, `name` text NOT NULL, `created_by` text NOT NULL, `expires_at` text NOT NULL, FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action );
--> statement-breakpoint
CREATE TABLE `customer_companies` ( `space_id` text DEFAULT '00000000-0000-4000-8000-00000000000d' NOT NULL, `id` text PRIMARY KEY NOT NULL, `name` text NOT NULL, `owner_id` text, `created_by` text, `created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL, `updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL, FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null, FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null );
--> statement-breakpoint
CREATE TABLE `customer_company_domains` ( `space_id` text DEFAULT '00000000-0000-4000-8000-00000000000d' NOT NULL, `domain` text NOT NULL, `company_id` text NOT NULL, `created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL, PRIMARY KEY(`space_id`, `domain`), FOREIGN KEY (`company_id`) REFERENCES `customer_companies`(`id`) ON UPDATE no action ON DELETE cascade, CONSTRAINT "customer_company_domains_domain_check" CHECK("customer_company_domains"."domain" = lower("customer_company_domains"."domain") and length("customer_company_domains"."domain") between 3 and 253) );
--> statement-breakpoint
CREATE TABLE `customer_contacts` ( `space_id` text DEFAULT '00000000-0000-4000-8000-00000000000d' NOT NULL, `id` text PRIMARY KEY NOT NULL, `name` text NOT NULL, `owner_id` text, `first_seen_at` text NOT NULL, `last_seen_at` text, `last_contacted_at` text, `created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL, `updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL, FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null );
--> statement-breakpoint
CREATE TABLE `customer_contact_companies` ( `contact_id` text NOT NULL, `company_id` text NOT NULL, `title` text DEFAULT '' NOT NULL, `current` integer DEFAULT true NOT NULL, `linked_by` text NOT NULL, `created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL, `updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL, PRIMARY KEY(`contact_id`, `company_id`), FOREIGN KEY (`contact_id`) REFERENCES `customer_contacts`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`company_id`) REFERENCES `customer_companies`(`id`) ON UPDATE no action ON DELETE cascade );
--> statement-breakpoint
CREATE TABLE `customer_identities` ( `space_id` text DEFAULT '00000000-0000-4000-8000-00000000000d' NOT NULL, `id` text PRIMARY KEY NOT NULL, `kind` text NOT NULL, `value` text NOT NULL, `display_name` text, `contact_id` text NOT NULL, `verified_at` text, `verified_by` text, `created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL, `updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL, FOREIGN KEY (`contact_id`) REFERENCES `customer_contacts`(`id`) ON UPDATE no action ON DELETE cascade, CONSTRAINT "customer_identities_verified_check" CHECK(("customer_identities"."verified_at" is null) = ("customer_identities"."verified_by" is null)) );
--> statement-breakpoint
CREATE TABLE `customer_sources` ( `channel_id` text PRIMARY KEY NOT NULL, `kind` text NOT NULL, `first_line_agent_id` text, `first_line_enabled` integer DEFAULT false NOT NULL, `created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL, `updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL, FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`first_line_agent_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null );
--> statement-breakpoint
CREATE TABLE `customer_conversations` ( `channel_id` text PRIMARY KEY NOT NULL, `source_channel_id` text NOT NULL, `contact_id` text, `status` text DEFAULT 'open' NOT NULL, `assignee_id` text, `identity_id` text, `last_message_at` text NOT NULL, `created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL, `updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL, FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`source_channel_id`) REFERENCES `customer_sources`(`channel_id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`contact_id`) REFERENCES `customer_contacts`(`id`) ON UPDATE no action ON DELETE set null, FOREIGN KEY (`assignee_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null, FOREIGN KEY (`identity_id`) REFERENCES `customer_identities`(`id`) ON UPDATE no action ON DELETE set null );
--> statement-breakpoint
CREATE TABLE `customer_telegram_bots` ( `channel_id` text PRIMARY KEY NOT NULL, `bot_id` text NOT NULL, `username` text NOT NULL, `token_ciphertext` text NOT NULL, `token_iv` text NOT NULL, `webhook_secret` text NOT NULL, `updates` text DEFAULT 'webhook' NOT NULL, `api_base` text DEFAULT 'https://api.telegram.org' NOT NULL, `update_offset` integer DEFAULT 0 NOT NULL, `greeting` text DEFAULT '' NOT NULL, `enabled` integer DEFAULT true NOT NULL, `last_error` text, `created_by` text, `created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL, `updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL, FOREIGN KEY (`channel_id`) REFERENCES `customer_sources`(`channel_id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null );
--> statement-breakpoint
CREATE TABLE `customer_telegram_messages` ( `message_id` text PRIMARY KEY NOT NULL, `conversation_channel_id` text NOT NULL, `direction` text NOT NULL, `status` text NOT NULL, `telegram_message_id` integer, `error` text, `created_at` text NOT NULL, FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`conversation_channel_id`) REFERENCES `customer_conversations`(`channel_id`) ON UPDATE no action ON DELETE cascade );
--> statement-breakpoint
CREATE TABLE `customer_widgets` ( `channel_id` text PRIMARY KEY NOT NULL, `public_id` text NOT NULL, `name` text NOT NULL, `sites_json` text DEFAULT '[]' NOT NULL, `greeting` text DEFAULT '' NOT NULL, `enabled` integer DEFAULT true NOT NULL, `created_by` text, `created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL, `updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL, FOREIGN KEY (`channel_id`) REFERENCES `customer_sources`(`channel_id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null );
--> statement-breakpoint
CREATE TABLE `customer_visitors` ( `id` text PRIMARY KEY NOT NULL, `widget_channel_id` text NOT NULL, `identity_id` text NOT NULL, `token_hash` text NOT NULL, `claimed_name` text, `claimed_email` text, `user_agent` text, `country` text, `created_at` text NOT NULL, `last_seen_at` text NOT NULL, FOREIGN KEY (`widget_channel_id`) REFERENCES `customer_widgets`(`channel_id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`identity_id`) REFERENCES `customer_identities`(`id`) ON UPDATE no action ON DELETE cascade, CONSTRAINT "customer_visitors_user_agent_check" CHECK("customer_visitors"."user_agent" is null or length("customer_visitors"."user_agent") <= 512) );
--> statement-breakpoint
CREATE TABLE `customer_widget_messages` ( `message_id` text PRIMARY KEY NOT NULL, `conversation_channel_id` text NOT NULL, `direction` text NOT NULL, `created_at` text NOT NULL, FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`conversation_channel_id`) REFERENCES `customer_conversations`(`channel_id`) ON UPDATE no action ON DELETE cascade );
--> statement-breakpoint
CREATE TABLE `data_bookmarks` ( `user_id` text NOT NULL, `target_type` text NOT NULL, `target_id` text NOT NULL, `position` integer DEFAULT 0 NOT NULL, `created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL, PRIMARY KEY(`user_id`, `target_type`, `target_id`), FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade );
--> statement-breakpoint
CREATE TABLE `data_record_requests` ( `principal_id` text NOT NULL, `database_id` text NOT NULL, `request_id` text NOT NULL, `record_id` text, `body_hash` text NOT NULL, PRIMARY KEY(`principal_id`, `database_id`, `request_id`), FOREIGN KEY (`principal_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action, FOREIGN KEY (`database_id`) REFERENCES `database_definitions`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`record_id`) REFERENCES `data_items`(`id`) ON UPDATE no action ON DELETE set null );
--> statement-breakpoint
CREATE TABLE `data_references` ( `source_type` text NOT NULL, `source_id` text NOT NULL, `target_type` text NOT NULL, `target_id` text NOT NULL, `created_by` text NOT NULL, `created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL, PRIMARY KEY(`source_type`, `source_id`, `target_type`, `target_id`), FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action );
--> statement-breakpoint
CREATE TABLE `database_fields` ( `id` text PRIMARY KEY NOT NULL, `deleted_at` text, `database_id` text NOT NULL, `name` text NOT NULL, `type` text NOT NULL, `slot` text NOT NULL, `config_json` text DEFAULT '{}' NOT NULL, `position` integer DEFAULT 0 NOT NULL, `created_by` text NOT NULL, `created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL, `updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL, FOREIGN KEY (`database_id`) REFERENCES `database_definitions`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action );
--> statement-breakpoint
CREATE TABLE `database_item_links` ( `id` text PRIMARY KEY NOT NULL, `field_id` text NOT NULL, `item_id` text NOT NULL, `target_item_id` text NOT NULL, `position` integer DEFAULT 0 NOT NULL, `created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL, FOREIGN KEY (`field_id`) REFERENCES `database_fields`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`item_id`) REFERENCES `data_items`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`target_item_id`) REFERENCES `data_items`(`id`) ON UPDATE no action ON DELETE cascade );
--> statement-breakpoint
CREATE TABLE `database_views` ( `id` text PRIMARY KEY NOT NULL, `deleted_at` text, `database_id` text NOT NULL, `name` text NOT NULL, `layout` text DEFAULT 'table' NOT NULL, `config_json` text DEFAULT '{"visibleFieldIds":null,"filters":[],"sorts":[{"fieldId":"title","direction":"asc"}],"groupFieldId":null,"dateFieldId":null}' NOT NULL, `position` integer DEFAULT 0 NOT NULL, `version` integer DEFAULT 1 NOT NULL, `created_by` text NOT NULL, `created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL, `updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL, FOREIGN KEY (`database_id`) REFERENCES `database_definitions`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action, CONSTRAINT "database_views_version_check" CHECK("database_views"."version" > 0) );
--> statement-breakpoint
CREATE TABLE `document_revisions` ( `document_id` text NOT NULL, `version` integer NOT NULL, `title` text NOT NULL, `content` text NOT NULL, `saved_at` text NOT NULL, PRIMARY KEY(`document_id`, `version`), FOREIGN KEY (`document_id`) REFERENCES `data_items`(`id`) ON UPDATE no action ON DELETE cascade );
--> statement-breakpoint
CREATE TABLE `email_mailboxes` ( `channel_id` text PRIMARY KEY NOT NULL, `domain_id` text NOT NULL, `local_part` text NOT NULL, `display_name` text NOT NULL, `enabled` integer DEFAULT true NOT NULL, `created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL, `updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL, FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`domain_id`) REFERENCES `email_domains`(`id`) ON UPDATE no action ON DELETE cascade, CONSTRAINT "email_mailboxes_local_part_check" CHECK("email_mailboxes"."local_part" = lower("email_mailboxes"."local_part") and length("email_mailboxes"."local_part") between 1 and 64) );
--> statement-breakpoint
CREATE TABLE `email_threads` ( `channel_id` text PRIMARY KEY NOT NULL, `mailbox_channel_id` text NOT NULL, `subject` text NOT NULL, `participants_json` text DEFAULT '[]' NOT NULL, `created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL, `updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL, FOREIGN KEY (`channel_id`) REFERENCES `customer_conversations`(`channel_id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`mailbox_channel_id`) REFERENCES `email_mailboxes`(`channel_id`) ON UPDATE no action ON DELETE cascade );
--> statement-breakpoint
CREATE TABLE `email_messages` ( `message_id` text PRIMARY KEY NOT NULL, `thread_channel_id` text NOT NULL, `direction` text NOT NULL, `from_address` text NOT NULL, `from_name` text, `to_json` text DEFAULT '[]' NOT NULL, `cc_json` text DEFAULT '[]' NOT NULL, `bcc_json` text DEFAULT '[]' NOT NULL, `rfc_message_id` text, `provider_message_id` text, `delivery_started_at` text, `reply_to_json` text DEFAULT '[]' NOT NULL, `in_reply_to` text, `references_json` text DEFAULT '[]' NOT NULL, `delivery_status` text DEFAULT 'received' NOT NULL, `raw_r2_key` text, `created_at` text NOT NULL, `mailbox_channel_id` text, `client_request_id` text, `delivery_attempts` integer DEFAULT 0 NOT NULL, `delivery_error` text, `delivered_at` text, `auth_verdict` text, `body_format` text DEFAULT 'text' NOT NULL, FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`thread_channel_id`) REFERENCES `email_threads`(`channel_id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`mailbox_channel_id`) REFERENCES `email_mailboxes`(`channel_id`) ON UPDATE no action ON DELETE cascade );
--> statement-breakpoint
CREATE TABLE `factory_boxes` ( `id` text PRIMARY KEY NOT NULL, `channel_id` text NOT NULL, `task_id` text NOT NULL, `agent_id` text NOT NULL, `initiated_by` text NOT NULL, `node_id` text NOT NULL, `environment_json` text NOT NULL, `origin_run_id` text NOT NULL, `run_id` text, `status` text DEFAULT 'new' NOT NULL, `lease_token` text, `lease_until` text, `cpu` real, `memory_mib` integer, `checkpoint_sha` text, `head_sha` text, `pull_json` text, `pushed_sha` text, `runtime_ms` integer DEFAULT 0 NOT NULL, `publication_count` integer DEFAULT 0 NOT NULL, `created_at` text NOT NULL, `updated_at` text NOT NULL, FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE no action, FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action, FOREIGN KEY (`agent_id`) REFERENCES `agents`(`user_id`) ON UPDATE no action ON DELETE no action, FOREIGN KEY (`initiated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action, FOREIGN KEY (`node_id`) REFERENCES `compute_nodes`(`id`) ON UPDATE no action ON DELETE no action, FOREIGN KEY (`origin_run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE no action, FOREIGN KEY (`run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE no action );
--> statement-breakpoint
CREATE TABLE `factory_approvals` ( `id` text PRIMARY KEY NOT NULL, `box_id` text NOT NULL, `run_id` text NOT NULL, `call_id` text NOT NULL, `kind` text NOT NULL, `request_json` text NOT NULL, `digest` text NOT NULL, `status` text NOT NULL, `diff_key` text, `diff_digest` text, `decided_by` text, `decided_at` text, `expires_at` text NOT NULL, `result_json` text, `created_at` text NOT NULL, FOREIGN KEY (`box_id`) REFERENCES `factory_boxes`(`id`) ON UPDATE no action ON DELETE no action, FOREIGN KEY (`run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE no action, FOREIGN KEY (`decided_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action );
--> statement-breakpoint
CREATE TABLE `gadgets` ( `space_id` text DEFAULT '00000000-0000-4000-8000-00000000000d' NOT NULL, `id` text PRIMARY KEY NOT NULL, `name` text NOT NULL, `description` text DEFAULT '' NOT NULL, `draft_spec_json` text NOT NULL, `draft_revision` integer DEFAULT 1 NOT NULL, `published_version` integer, `position` integer DEFAULT 0 NOT NULL, `created_by` text NOT NULL, `created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL, `updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL, FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action, CONSTRAINT "gadgets_draft_revision_check" CHECK("gadgets"."draft_revision" > 0), CONSTRAINT "gadgets_published_version_check" CHECK("gadgets"."published_version" is null or "gadgets"."published_version" > 0) );
--> statement-breakpoint
CREATE TABLE `gadget_versions` ( `id` text PRIMARY KEY NOT NULL, `gadget_id` text NOT NULL, `version` integer NOT NULL, `name` text NOT NULL, `description` text DEFAULT '' NOT NULL, `spec_json` text NOT NULL, `created_by` text NOT NULL, `created_at` text NOT NULL, FOREIGN KEY (`gadget_id`) REFERENCES `gadgets`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action, CONSTRAINT "gadget_versions_version_check" CHECK("gadget_versions"."version" > 0) );
--> statement-breakpoint
CREATE TABLE `git_connections` ( `id` text PRIMARY KEY NOT NULL, `name` text NOT NULL, `provider` text NOT NULL, `host` text NOT NULL, `account` text NOT NULL, `app_id` text NOT NULL, `app_slug` text NOT NULL, `credential_json` text NOT NULL, `enabled` integer DEFAULT true NOT NULL, `created_by` text NOT NULL, `created_at` text NOT NULL, `updated_at` text NOT NULL, FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action );
--> statement-breakpoint
CREATE TABLE `git_setup_requests` ( `state_hash` text PRIMARY KEY NOT NULL, `name` text NOT NULL, `account` text NOT NULL, `actor_id` text NOT NULL, `origin` text NOT NULL, `status` text NOT NULL, `created_at` text NOT NULL, `expires_at` text NOT NULL, FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action );
--> statement-breakpoint
CREATE TABLE `server` ( `id` text PRIMARY KEY NOT NULL, `singleton` integer DEFAULT 1 NOT NULL, `name` text NOT NULL, `icon_r2_key` text, `owner_id` text NOT NULL, `created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL, `updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL, FOREIGN KEY (`id`) REFERENCES `server_identity`(`id`) ON UPDATE no action ON DELETE no action, FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action, CONSTRAINT "server_singleton_check" CHECK("server"."singleton" = 1) );
--> statement-breakpoint
CREATE TABLE `mcp_outbound_connections` ( `space_id` text DEFAULT '00000000-0000-4000-8000-00000000000d' NOT NULL, `id` text PRIMARY KEY NOT NULL, `server_id` text NOT NULL, `owner_id` text, `created_by` text NOT NULL, `name` text NOT NULL, `provider_id` text NOT NULL, `endpoint` text, `description` text DEFAULT '' NOT NULL, `auth_kind` text DEFAULT 'none' NOT NULL, `enabled` integer DEFAULT 0 NOT NULL, `revision` integer DEFAULT 1 NOT NULL, `tool_names_json` text NOT NULL, `tools_json` text DEFAULT '[]' NOT NULL, `credential_json` text, `credential_expires_at` text, `checked_at` text, `last_error` text, `created_at` text NOT NULL, `updated_at` text NOT NULL, FOREIGN KEY (`server_id`) REFERENCES `server`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade, CONSTRAINT "mcp_outbound_enabled" CHECK("mcp_outbound_connections"."enabled" IN (0,1)) );
--> statement-breakpoint
CREATE TABLE `project_policies` ( `id` text PRIMARY KEY NOT NULL, `name` text NOT NULL, `description` text DEFAULT '' NOT NULL, `permissions_bitmask` integer NOT NULL, `version` integer DEFAULT 1 NOT NULL, `created_by` text, `created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL, `updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL, FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action, CONSTRAINT "project_policies_permissions_bitmask_check" CHECK("project_policies"."permissions_bitmask" >= 0) );
--> statement-breakpoint
CREATE TABLE `grants` ( `id` text PRIMARY KEY NOT NULL, `member_id` text, `role_id` text, `agent_id` text, `policy_id` text, `permissions` integer, `project_id` text, `channel_id` text, `mailbox_id` text, `gadget_id` text, `gadget_version_id` text, `connection_id` text, `daily_runs` integer, `expires_at` text, `created_by` text, `created_at` text NOT NULL, FOREIGN KEY (`member_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`agent_id`) REFERENCES `agents`(`user_id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`policy_id`) REFERENCES `project_policies`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`mailbox_id`) REFERENCES `email_mailboxes`(`channel_id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`gadget_id`) REFERENCES `gadgets`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`gadget_version_id`) REFERENCES `gadget_versions`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`connection_id`) REFERENCES `mcp_outbound_connections`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action, CONSTRAINT "grants_subject" CHECK(("grants"."member_id" IS NOT NULL AND "grants"."role_id" IS NULL) OR ("grants"."role_id" IS NOT NULL AND "grants"."member_id" IS NULL)), CONSTRAINT "grants_content" CHECK(("grants"."policy_id" IS NULL) <> ("grants"."permissions" IS NULL)), CONSTRAINT "grants_permissions" CHECK("grants"."permissions" IS NULL OR "grants"."permissions" > 0), CONSTRAINT "grants_daily_runs" CHECK("grants"."daily_runs" IS NULL OR "grants"."daily_runs" BETWEEN 1 AND 10000), CONSTRAINT "grants_one_scope" CHECK(("grants"."project_id" IS NOT NULL) + ("grants"."channel_id" IS NOT NULL) + ("grants"."mailbox_id" IS NOT NULL) + ("grants"."gadget_id" IS NOT NULL) + ("grants"."gadget_version_id" IS NOT NULL) + ("grants"."connection_id" IS NOT NULL) <= 1), CONSTRAINT "grants_scope" CHECK("grants"."agent_id" IS NOT NULL OR "grants"."project_id" IS NOT NULL OR "grants"."channel_id" IS NOT NULL OR "grants"."mailbox_id" IS NOT NULL OR "grants"."gadget_id" IS NOT NULL OR "grants"."gadget_version_id" IS NOT NULL OR "grants"."connection_id" IS NOT NULL), CONSTRAINT "grants_agent_limits" CHECK("grants"."agent_id" IS NOT NULL OR ("grants"."daily_runs" IS NULL AND "grants"."expires_at" IS NULL)), CONSTRAINT "grants_policy_scope" CHECK(("grants"."policy_id" IS NOT NULL) = ("grants"."channel_id" IS NULL AND "grants"."mailbox_id" IS NULL AND "grants"."gadget_id" IS NULL AND "grants"."gadget_version_id" IS NULL AND "grants"."connection_id" IS NULL)), CONSTRAINT "grants_channel" CHECK("grants"."channel_id" IS NULL OR ("grants"."role_id" IS NOT NULL AND ("grants"."permissions" & ~112) = 0)), CONSTRAINT "grants_mailbox" CHECK("grants"."mailbox_id" IS NULL OR ("grants"."member_id" IS NOT NULL AND "grants"."permissions" IN (536870912, 1610612736, 1610612738))), CONSTRAINT "grants_gadget" CHECK(("grants"."gadget_id" IS NULL AND "grants"."gadget_version_id" IS NULL) OR ("grants"."role_id" IS NOT NULL AND "grants"."permissions" = 1024)), CONSTRAINT "grants_connection" CHECK("grants"."connection_id" IS NULL OR "grants"."permissions" = 33554432) );
--> statement-breakpoint
CREATE TABLE `invites` ( `space_id` text DEFAULT '00000000-0000-4000-8000-00000000000d' NOT NULL, `code` text PRIMARY KEY NOT NULL, `creator_id` text NOT NULL, `max_uses` integer DEFAULT 0 NOT NULL, `uses` integer DEFAULT 0 NOT NULL, `expires_at` text, `created_at` text NOT NULL, `project_id` text, `policy_id` text, FOREIGN KEY (`creator_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action, FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`policy_id`) REFERENCES `project_policies`(`id`) ON UPDATE no action ON DELETE cascade );
--> statement-breakpoint
CREATE TABLE `mail_drafts` ( `id` text PRIMARY KEY NOT NULL, `mailbox_channel_id` text NOT NULL, `thread_channel_id` text, `author_id` text NOT NULL, `to_json` text DEFAULT '[]' NOT NULL, `cc_json` text DEFAULT '[]' NOT NULL, `bcc_json` text DEFAULT '[]' NOT NULL, `subject` text DEFAULT '' NOT NULL, `content` text DEFAULT '' NOT NULL, `body_format` text DEFAULT 'text' NOT NULL, `attachment_ids_json` text DEFAULT '[]' NOT NULL, `created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL, `updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL, FOREIGN KEY (`mailbox_channel_id`) REFERENCES `email_mailboxes`(`channel_id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`thread_channel_id`) REFERENCES `email_threads`(`channel_id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade );
--> statement-breakpoint
CREATE TABLE `spaces` ( `id` text PRIMARY KEY NOT NULL, `name` text NOT NULL, `description` text DEFAULT '' NOT NULL, `is_default` integer DEFAULT false NOT NULL, `storage_limit_bytes` integer, `member_limit` integer, `agent_limit` integer, `monthly_run_limit` integer, `monthly_email_limit` integer, `monthly_voice_limit` integer, `suspended_at` text, `action_limits_json` text DEFAULT '{}' NOT NULL, `created_by` text, `created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL, `updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL, FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null );
--> statement-breakpoint
CREATE TABLE `mcp_access_tokens` ( `id` text PRIMARY KEY NOT NULL, `name` text NOT NULL, `token_hash` text NOT NULL, `token_prefix` text NOT NULL, `scopes_json` text NOT NULL, `subject_id` text NOT NULL, `created_by` text NOT NULL, `last_used_at` text, `revoked_at` text, `space_id` text, `board_id` text, `created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL, `updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL, FOREIGN KEY (`subject_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`board_id`) REFERENCES `task_boards`(`id`) ON UPDATE no action ON DELETE set null );
--> statement-breakpoint
CREATE TABLE `mcp_oauth_connections` ( `id` text PRIMARY KEY NOT NULL, `client_id` text NOT NULL, `subject_id` text NOT NULL, `created_by` text NOT NULL, `resource` text NOT NULL, `scopes_json` text NOT NULL, `created_at` text NOT NULL, `last_used_at` text, `revoked_at` text, FOREIGN KEY (`client_id`) REFERENCES `auth_oauth_client`(`client_id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`subject_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade );
--> statement-breakpoint
CREATE TABLE `message_mentions` ( `message_id` text NOT NULL, `user_id` text NOT NULL, `role_id` text, PRIMARY KEY(`message_id`, `user_id`), FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade );
--> statement-breakpoint
CREATE TABLE `message_pins` ( `message_id` text PRIMARY KEY NOT NULL, `pinned_by` text NOT NULL, `pinned_at` text NOT NULL, FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`pinned_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action );
--> statement-breakpoint
CREATE TABLE `message_reactions` ( `message_id` text NOT NULL, `user_id` text NOT NULL, `emoji` text NOT NULL, `created_at` text NOT NULL, PRIMARY KEY(`message_id`, `user_id`, `emoji`), FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade );
--> statement-breakpoint
CREATE TABLE `push_subscriptions` ( `id` text PRIMARY KEY NOT NULL, `user_id` text NOT NULL, `endpoint` text NOT NULL, `p256dh` text NOT NULL, `auth` text NOT NULL, `user_agent` text, `created_at` text NOT NULL, `updated_at` text NOT NULL, FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade );
--> statement-breakpoint
CREATE TABLE `notification_outbox` ( `event_id` text NOT NULL, `subscription_id` text NOT NULL, `recipient_id` text NOT NULL, `kind` text NOT NULL, `channel_id` text NOT NULL, `payload_json` text NOT NULL, `attempts` integer DEFAULT 0 NOT NULL, `available_at` text NOT NULL, `lease_token` text, `lease_until` text, `delivered_at` text, `failed_at` text, `last_error` text, `created_at` text NOT NULL, PRIMARY KEY(`event_id`, `subscription_id`), FOREIGN KEY (`subscription_id`) REFERENCES `push_subscriptions`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`recipient_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE cascade );
--> statement-breakpoint
CREATE TABLE `project_repositories` ( `id` text PRIMARY KEY NOT NULL, `project_id` text NOT NULL, `provider` text NOT NULL, `host` text NOT NULL, `external_id` text NOT NULL, `slug` text NOT NULL, `default_branch` text NOT NULL, `environment_id` text, `created_by` text NOT NULL, `created_at` text NOT NULL, FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`environment_id`) REFERENCES `agent_environments`(`id`) ON UPDATE no action ON DELETE no action, FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action );
--> statement-breakpoint
CREATE TABLE `project_releases` ( `id` text PRIMARY KEY NOT NULL, `project_id` text NOT NULL, `repository_id` text, `repository` text NOT NULL, `tag` text NOT NULL, `version` text NOT NULL, `sha` text NOT NULL, `message` text DEFAULT '' NOT NULL, `created_by` text NOT NULL, `created_at` text NOT NULL, FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`repository_id`) REFERENCES `project_repositories`(`id`) ON UPDATE no action ON DELETE set null, FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action );
--> statement-breakpoint
CREATE TABLE `project_secrets` ( `id` text PRIMARY KEY NOT NULL, `project_id` text NOT NULL, `name` text NOT NULL, `placeholder` text NOT NULL, `hosts_json` text DEFAULT '[]' NOT NULL, `secret_ciphertext` text NOT NULL, `secret_iv` text NOT NULL, `secret_version` integer DEFAULT 1 NOT NULL, `created_by` text NOT NULL, `created_at` text NOT NULL, `updated_at` text NOT NULL, `last_used_at` text, FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action );
--> statement-breakpoint
CREATE TABLE `role_policies` ( `role_id` text NOT NULL, `policy_id` text NOT NULL, PRIMARY KEY(`role_id`, `policy_id`), FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`policy_id`) REFERENCES `project_policies`(`id`) ON UPDATE no action ON DELETE cascade );
--> statement-breakpoint
CREATE TABLE `server_domain_requests` ( `id` text PRIMARY KEY NOT NULL, `action` text NOT NULL, `hostname` text NOT NULL, `token_hash` text NOT NULL, `status` text DEFAULT 'pending' NOT NULL, `error` text, `created_at` text NOT NULL, `updated_at` text NOT NULL );
--> statement-breakpoint
CREATE TABLE `space_members` ( `space_id` text NOT NULL, `user_id` text NOT NULL, `role` text DEFAULT 'member' NOT NULL, `joined_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL, PRIMARY KEY(`space_id`, `user_id`), FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade );
--> statement-breakpoint
CREATE TABLE `space_stats` ( `space_id` text PRIMARY KEY NOT NULL, `people` integer DEFAULT 0 NOT NULL, `projects` integer DEFAULT 0 NOT NULL, `tasks` integer DEFAULT 0 NOT NULL, `recordings` integer DEFAULT 0 NOT NULL, `storage_bytes` integer DEFAULT 0 NOT NULL, `messages` integer DEFAULT 0 NOT NULL, `last_activity_at` text, `refreshed_at` text NOT NULL, FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE cascade );
--> statement-breakpoint
CREATE TABLE `space_task_counters` ( `space_id` text PRIMARY KEY NOT NULL, `last` integer NOT NULL, FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE cascade );
--> statement-breakpoint
CREATE TABLE `space_usage` ( `space_id` text NOT NULL, `metric` text NOT NULL, `period` text NOT NULL, `count` integer DEFAULT 0 NOT NULL, PRIMARY KEY(`space_id`, `metric`, `period`), FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE cascade );
--> statement-breakpoint
CREATE TABLE `task_checklist_items` ( `id` text PRIMARY KEY NOT NULL, `task_id` text NOT NULL, `title` text NOT NULL, `completed` integer DEFAULT false NOT NULL, `position` integer DEFAULT 0 NOT NULL, `created_by` text NOT NULL, `created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL, `updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL, FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action );
--> statement-breakpoint
CREATE TABLE `task_dependencies` ( `task_id` text NOT NULL, `depends_on_task_id` text NOT NULL, `created_at` text NOT NULL, PRIMARY KEY(`task_id`, `depends_on_task_id`), FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`depends_on_task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade, CONSTRAINT "task_dependencies_not_self_check" CHECK("task_dependencies"."task_id" <> "task_dependencies"."depends_on_task_id") );
--> statement-breakpoint
CREATE TABLE `task_labels` ( `id` text PRIMARY KEY NOT NULL, `board_id` text NOT NULL, `name` text NOT NULL, `color` text DEFAULT 'neutral' NOT NULL, `position` integer DEFAULT 0 NOT NULL, `created_by` text NOT NULL, `created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL, `updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL, FOREIGN KEY (`board_id`) REFERENCES `task_boards`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action );
--> statement-breakpoint
CREATE TABLE `task_label_links` ( `task_id` text NOT NULL, `label_id` text NOT NULL, PRIMARY KEY(`task_id`, `label_id`), FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`label_id`) REFERENCES `task_labels`(`id`) ON UPDATE no action ON DELETE cascade );
--> statement-breakpoint
CREATE TABLE `task_numbers` ( `task_id` text PRIMARY KEY NOT NULL, `number` integer NOT NULL, `space_id` text NOT NULL, FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE cascade );
--> statement-breakpoint
INSERT INTO `users` (rowid, `id`, `kind`, `handle`, `display_name`, `avatar_r2_key`, `status`, `role_id`, `nickname`, `joined_at`, `created_at`, `updated_at`) SELECT `zugoid_keep_rowid`, `id`, `kind`, `handle`, `display_name`, `avatar_r2_key`, `status`, `role_id`, `nickname`, `joined_at`, `created_at`, `updated_at` FROM `zugoid_keep_users` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `agent_environments` (rowid, `id`, `config_json`, `enabled`, `version`, `created_by`, `created_at`, `updated_at`, `space_id`) SELECT `zugoid_keep_rowid`, `id`, `config_json`, `enabled`, `version`, `created_by`, `created_at`, `updated_at`, `space_id` FROM `zugoid_keep_agent_environments` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `channels` (rowid, `space_id`, `id`, `name`, `topic`, `type`, `section`, `visibility`, `category_id`, `position`, `created_by`, `dm_kind`, `dm_owner_id`, `dm_pair_key`, `live_meeting_id`, `archived_at`, `archived_by`, `parent_id`, `parent_message_id`, `created_at`, `updated_at`) SELECT `zugoid_keep_rowid`, `space_id`, `id`, `name`, `topic`, `type`, `section`, `visibility`, `category_id`, `position`, `created_by`, `dm_kind`, `dm_owner_id`, `dm_pair_key`, `live_meeting_id`, `archived_at`, `archived_by`, `parent_id`, `parent_message_id`, `created_at`, `updated_at` FROM `zugoid_keep_channels` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `messages` (rowid, `id`, `channel_id`, `author_id`, `content`, `reply_to_id`, `edited_at`, `deleted_at`, `created_at`) SELECT `zugoid_keep_rowid`, `id`, `channel_id`, `author_id`, `content`, `reply_to_id`, `edited_at`, `deleted_at`, `created_at` FROM `zugoid_keep_messages` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `task_attachments` (rowid, `id`, `task_id`, `uploader_id`, `r2_key`, `filename`, `content_type`, `size_bytes`, `width`, `height`, `created_at`, `role`, `source_id`, `marks_json`) SELECT `zugoid_keep_rowid`, `id`, `task_id`, `uploader_id`, `r2_key`, `filename`, `content_type`, `size_bytes`, `width`, `height`, `created_at`, `role`, `source_id`, `marks_json` FROM `zugoid_keep_task_attachments` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `task_boards` (rowid, `space_id`, `id`, `name`, `position`, `created_by`, `archived_at`, `created_at`, `updated_at`) SELECT `zugoid_keep_rowid`, `space_id`, `id`, `name`, `position`, `created_by`, `archived_at`, `created_at`, `updated_at` FROM `zugoid_keep_task_boards` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `projects` (rowid, `space_id`, `id`, `name`, `description`, `archived_at`, `version`, `factory_json`, `created_by`, `created_at`, `updated_at`) SELECT `zugoid_keep_rowid`, `space_id`, `id`, `name`, `description`, `archived_at`, `version`, `factory_json`, `created_by`, `created_at`, `updated_at` FROM `zugoid_keep_projects` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `tasks` (rowid, `parent_task_id`, `project_id`, `id`, `board_id`, `title`, `description`, `status`, `priority`, `due_at`, `position`, `assignee_id`, `environment_id`, `factory_state`, `channel_id`, `discussion_channel_id`, `created_by`, `result_summary`, `result_details`, `last_error`, `archived_at`, `source_channel_id`, `source_message_id`, `cover_attachment_id`, `pull_url`, `preview_url`, `created_at`, `updated_at`) SELECT `zugoid_keep_rowid`, `parent_task_id`, `project_id`, `id`, `board_id`, `title`, `description`, `status`, `priority`, `due_at`, `position`, `assignee_id`, `environment_id`, `factory_state`, `channel_id`, `discussion_channel_id`, `created_by`, `result_summary`, `result_details`, `last_error`, `archived_at`, `source_channel_id`, `source_message_id`, `cover_attachment_id`, `pull_url`, `preview_url`, `created_at`, `updated_at` FROM `zugoid_keep_tasks` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `agents` (rowid, `harness`, `user_id`, `model`, `instructions`, `status`, `access`, `created_by`, `last_active_at`, `archived_at`, `archived_by`, `created_at`, `updated_at`) SELECT `zugoid_keep_rowid`, `harness`, `user_id`, `model`, `instructions`, `status`, `access`, `created_by`, `last_active_at`, `archived_at`, `archived_by`, `created_at`, `updated_at` FROM `zugoid_keep_agents` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `agent_sessions` (rowid, `id`, `agent_id`, `channel_id`, `active_run_id`, `transcript_key`, `created_at`, `updated_at`, `untrusted_at`) SELECT `zugoid_keep_rowid`, `id`, `agent_id`, `channel_id`, `active_run_id`, `transcript_key`, `created_at`, `updated_at`, `untrusted_at` FROM `zugoid_keep_agent_sessions` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `agent_runs` (rowid, `id`, `private_at`, `session_id`, `agent_id`, `channel_id`, `initiated_by`, `task_id`, `source_message_id`, `idempotency_key`, `status`, `prompt`, `model`, `instructions`, `mandate_json`, `result_text`, `result_message_id`, `last_error`, `model_calls`, `total_tokens`, `event_cursor`, `deadline`, `created_at`, `updated_at`, `environment_json`, `files_key`, `task_edit_at`) SELECT `zugoid_keep_rowid`, `id`, `private_at`, `session_id`, `agent_id`, `channel_id`, `initiated_by`, `task_id`, `source_message_id`, `idempotency_key`, `status`, `prompt`, `model`, `instructions`, `mandate_json`, `result_text`, `result_message_id`, `last_error`, `model_calls`, `total_tokens`, `event_cursor`, `deadline`, `created_at`, `updated_at`, `environment_json`, `files_key`, `task_edit_at` FROM `zugoid_keep_agent_runs` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `agent_code_proposals` (rowid, `run_id`, `environment_id`, `input_hash`, `branch`, `commit_sha`, `published_commit_sha`, `pull_number`, `lease_until`, `lease_token`, `status`, `created_at`, `updated_at`) SELECT `zugoid_keep_rowid`, `run_id`, `environment_id`, `input_hash`, `branch`, `commit_sha`, `published_commit_sha`, `pull_number`, `lease_until`, `lease_token`, `status`, `created_at`, `updated_at` FROM `zugoid_keep_agent_code_proposals` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `agent_model_calls` (rowid, `run_id`, `call_number`, `model`, `status`, `started_at`, `completed_at`, `total_tokens`, `error`) SELECT `zugoid_keep_rowid`, `run_id`, `call_number`, `model`, `status`, `started_at`, `completed_at`, `total_tokens`, `error` FROM `zugoid_keep_agent_model_calls` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `agent_run_deliveries` (rowid, `run_id`, `task_status`, `task_error`, `report_status`, `report_error`, `attempts`, `updated_at`) SELECT `zugoid_keep_rowid`, `run_id`, `task_status`, `task_error`, `report_status`, `report_error`, `attempts`, `updated_at` FROM `zugoid_keep_agent_run_deliveries` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `agent_run_events` (rowid, `run_id`, `sequence`, `event_json`, `created_at`) SELECT `zugoid_keep_rowid`, `run_id`, `sequence`, `event_json`, `created_at` FROM `zugoid_keep_agent_run_events` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `agent_run_publications` (rowid, `id`, `run_id`, `digest`, `payload_json`, `status`, `message_id`, `created_at`, `expires_at`, `decided_at`, `decided_by`, `completed_at`) SELECT `zugoid_keep_rowid`, `id`, `run_id`, `digest`, `payload_json`, `status`, `message_id`, `created_at`, `expires_at`, `decided_at`, `decided_by`, `completed_at` FROM `zugoid_keep_agent_run_publications` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `agent_run_tools` (rowid, `run_id`, `call_id`, `name`, `arguments_json`, `policy_json`, `status`, `result_json`, `created_at`) SELECT `zugoid_keep_rowid`, `run_id`, `call_id`, `name`, `arguments_json`, `policy_json`, `status`, `result_json`, `created_at` FROM `zugoid_keep_agent_run_tools` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `agent_schedules` (rowid, `id`, `principal_id`, `created_by`, `channel_id`, `kind`, `content`, `agent_id`, `task_id`, `first_at`, `timezone`, `recurrence`, `next_at`, `status`, `last_error`, `authorization_json`, `mandate_json`, `created_at`, `paused_at`, `dismissed_at`, `last_error_code`) SELECT `zugoid_keep_rowid`, `id`, `principal_id`, `created_by`, `channel_id`, `kind`, `content`, `agent_id`, `task_id`, `first_at`, `timezone`, `recurrence`, `next_at`, `status`, `last_error`, `authorization_json`, `mandate_json`, `created_at`, `paused_at`, `dismissed_at`, `last_error_code` FROM `zugoid_keep_agent_schedules` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `agent_schedule_occurrences` (rowid, `schedule_id`, `due_at`, `message_id`, `run_id`, `completed_at`, `attempts`, `failed_at`, `last_error`) SELECT `zugoid_keep_rowid`, `schedule_id`, `due_at`, `message_id`, `run_id`, `completed_at`, `attempts`, `failed_at`, `last_error` FROM `zugoid_keep_agent_schedule_occurrences` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `agent_tool_decisions` (rowid, `run_id`, `call_id`, `tool`, `effect`, `untrusted_context`, `decision`, `reason`, `created_at`) SELECT `zugoid_keep_rowid`, `run_id`, `call_id`, `tool`, `effect`, `untrusted_context`, `decision`, `reason`, `created_at` FROM `zugoid_keep_agent_tool_decisions` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `agent_turns` (rowid, `submission_id`, `agent_id`, `channel_id`, `source_message_id`, `initiated_by`, `request_id`, `status`, `detail`, `approval_json`, `created_at`, `updated_at`) SELECT `zugoid_keep_rowid`, `submission_id`, `agent_id`, `channel_id`, `source_message_id`, `initiated_by`, `request_id`, `status`, `detail`, `approval_json`, `created_at`, `updated_at` FROM `zugoid_keep_agent_turns` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `agent_webhooks` (rowid, `agent_id`, `url`, `header_name`, `credential_json`, `reply_timeout_minutes`, `created_by`, `created_at`, `updated_at`) SELECT `zugoid_keep_rowid`, `agent_id`, `url`, `header_name`, `credential_json`, `reply_timeout_minutes`, `created_by`, `created_at`, `updated_at` FROM `zugoid_keep_agent_webhooks` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `attachments` (rowid, `id`, `message_id`, `channel_id`, `uploader_id`, `r2_key`, `filename`, `content_type`, `size_bytes`, `width`, `height`, `created_at`) SELECT `zugoid_keep_rowid`, `id`, `message_id`, `channel_id`, `uploader_id`, `r2_key`, `filename`, `content_type`, `size_bytes`, `width`, `height`, `created_at` FROM `zugoid_keep_attachments` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `audit_log` (rowid, `space_id`, `id`, `actor_id`, `action`, `target_type`, `target_id`, `meta_json`, `created_at`) SELECT `zugoid_keep_rowid`, `space_id`, `id`, `actor_id`, `action`, `target_type`, `target_id`, `meta_json`, `created_at` FROM `zugoid_keep_audit_log` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `auth_provider_credentials` (rowid, `provider`, `public_key`, `secret_ciphertext`, `secret_iv`, `secret_version`, `created_at`, `updated_at`) SELECT `zugoid_keep_rowid`, `provider`, `public_key`, `secret_ciphertext`, `secret_iv`, `secret_version`, `created_at`, `updated_at` FROM `zugoid_keep_auth_provider_credentials` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `auth_settings` (`id`, `registration_mode`, `password_enabled`, `github_enabled`, `google_enabled`, `linkedin_enabled`, `twitter_enabled`, `turnstile_enabled`, `email_from`, `email_from_name`, `created_at`, `updated_at`) SELECT `id`, `registration_mode`, `password_enabled`, `github_enabled`, `google_enabled`, `linkedin_enabled`, `twitter_enabled`, `turnstile_enabled`, `email_from`, `email_from_name`, `created_at`, `updated_at` FROM `zugoid_keep_auth_settings`;
--> statement-breakpoint
INSERT INTO `database_definitions` (rowid, `space_id`, `id`, `deleted_at`, `name`, `position`, `created_by`, `archived_at`, `created_at`, `updated_at`) SELECT `zugoid_keep_rowid`, `space_id`, `id`, `deleted_at`, `name`, `position`, `created_by`, `archived_at`, `created_at`, `updated_at` FROM `zugoid_keep_database_definitions` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `data_items` (rowid, `id`, `space_id`, `kind`, `parent_id`, `content`, `icon`, `deleted_at`, `mutation_id`, `database_id`, `title`, `position`, `version`, `created_by`, `text_1`, `text_2`, `text_3`, `text_4`, `text_5`, `text_6`, `text_7`, `text_8`, `text_9`, `text_10`, `text_11`, `text_12`, `text_13`, `text_14`, `text_15`, `text_16`, `number_1`, `number_2`, `number_3`, `number_4`, `number_5`, `number_6`, `number_7`, `number_8`, `boolean_1`, `boolean_2`, `boolean_3`, `boolean_4`, `boolean_5`, `boolean_6`, `boolean_7`, `boolean_8`, `date_1`, `date_2`, `date_3`, `date_4`, `date_5`, `date_6`, `date_7`, `date_8`, `select_1`, `select_2`, `select_3`, `select_4`, `select_5`, `select_6`, `select_7`, `select_8`, `created_at`, `updated_at`) SELECT `zugoid_keep_rowid`, `id`, `space_id`, `kind`, `parent_id`, `content`, `icon`, `deleted_at`, `mutation_id`, `database_id`, `title`, `position`, `version`, `created_by`, `text_1`, `text_2`, `text_3`, `text_4`, `text_5`, `text_6`, `text_7`, `text_8`, `text_9`, `text_10`, `text_11`, `text_12`, `text_13`, `text_14`, `text_15`, `text_16`, `number_1`, `number_2`, `number_3`, `number_4`, `number_5`, `number_6`, `number_7`, `number_8`, `boolean_1`, `boolean_2`, `boolean_3`, `boolean_4`, `boolean_5`, `boolean_6`, `boolean_7`, `boolean_8`, `date_1`, `date_2`, `date_3`, `date_4`, `date_5`, `date_6`, `date_7`, `date_8`, `select_1`, `select_2`, `select_3`, `select_4`, `select_5`, `select_6`, `select_7`, `select_8`, `created_at`, `updated_at` FROM `zugoid_keep_data_items` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `canvas_nodes` (rowid, `id`, `canvas_id`, `kind`, `content`, `x`, `y`, `width`, `height`, `color`, `version`, `created_by`, `created_at`, `updated_at`) SELECT `zugoid_keep_rowid`, `id`, `canvas_id`, `kind`, `content`, `x`, `y`, `width`, `height`, `color`, `version`, `created_by`, `created_at`, `updated_at` FROM `zugoid_keep_canvas_nodes` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `canvas_edges` (rowid, `id`, `canvas_id`, `from_node_id`, `to_node_id`, `created_by`, `created_at`) SELECT `zugoid_keep_rowid`, `id`, `canvas_id`, `from_node_id`, `to_node_id`, `created_by`, `created_at` FROM `zugoid_keep_canvas_edges` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `channel_attention` (rowid, `channel_id`, `user_id`, `following`, `notifications`, `read_generation`) SELECT `zugoid_keep_rowid`, `channel_id`, `user_id`, `following`, `notifications`, `read_generation` FROM `zugoid_keep_channel_attention` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `channel_members` (rowid, `channel_id`, `user_id`, `hidden_at`, `joined_at`) SELECT `zugoid_keep_rowid`, `channel_id`, `user_id`, `hidden_at`, `joined_at` FROM `zugoid_keep_channel_members` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `channel_reads` (rowid, `channel_id`, `user_id`, `last_read_message_id`, `updated_at`) SELECT `zugoid_keep_rowid`, `channel_id`, `user_id`, `last_read_message_id`, `updated_at` FROM `zugoid_keep_channel_reads` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `channel_role_denies` (rowid, `channel_id`, `role_id`, `deny_mask`, `created_at`) SELECT `zugoid_keep_rowid`, `channel_id`, `role_id`, `deny_mask`, `created_at` FROM `zugoid_keep_channel_role_denies` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `compute_nodes` (rowid, `id`, `name`, `token_hash`, `enabled`, `capabilities_json`, `last_seen`, `created_by`, `created_at`) SELECT `zugoid_keep_rowid`, `id`, `name`, `token_hash`, `enabled`, `capabilities_json`, `last_seen`, `created_by`, `created_at` FROM `zugoid_keep_compute_nodes` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `compute_pairings` (rowid, `token_hash`, `name`, `created_by`, `expires_at`) SELECT `zugoid_keep_rowid`, `token_hash`, `name`, `created_by`, `expires_at` FROM `zugoid_keep_compute_pairings` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `customer_companies` (rowid, `space_id`, `id`, `name`, `owner_id`, `created_by`, `created_at`, `updated_at`) SELECT `zugoid_keep_rowid`, `space_id`, `id`, `name`, `owner_id`, `created_by`, `created_at`, `updated_at` FROM `zugoid_keep_customer_companies` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `customer_company_domains` (rowid, `space_id`, `domain`, `company_id`, `created_at`) SELECT `zugoid_keep_rowid`, `space_id`, `domain`, `company_id`, `created_at` FROM `zugoid_keep_customer_company_domains` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `customer_contacts` (rowid, `space_id`, `id`, `name`, `owner_id`, `first_seen_at`, `last_seen_at`, `last_contacted_at`, `created_at`, `updated_at`) SELECT `zugoid_keep_rowid`, `space_id`, `id`, `name`, `owner_id`, `first_seen_at`, `last_seen_at`, `last_contacted_at`, `created_at`, `updated_at` FROM `zugoid_keep_customer_contacts` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `customer_contact_companies` (rowid, `contact_id`, `company_id`, `title`, `current`, `linked_by`, `created_at`, `updated_at`) SELECT `zugoid_keep_rowid`, `contact_id`, `company_id`, `title`, `current`, `linked_by`, `created_at`, `updated_at` FROM `zugoid_keep_customer_contact_companies` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `customer_identities` (rowid, `space_id`, `id`, `kind`, `value`, `display_name`, `contact_id`, `verified_at`, `verified_by`, `created_at`, `updated_at`) SELECT `zugoid_keep_rowid`, `space_id`, `id`, `kind`, `value`, `display_name`, `contact_id`, `verified_at`, `verified_by`, `created_at`, `updated_at` FROM `zugoid_keep_customer_identities` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `customer_sources` (rowid, `channel_id`, `kind`, `first_line_agent_id`, `first_line_enabled`, `created_at`, `updated_at`) SELECT `zugoid_keep_rowid`, `channel_id`, `kind`, `first_line_agent_id`, `first_line_enabled`, `created_at`, `updated_at` FROM `zugoid_keep_customer_sources` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `customer_conversations` (rowid, `channel_id`, `source_channel_id`, `contact_id`, `status`, `assignee_id`, `identity_id`, `last_message_at`, `created_at`, `updated_at`) SELECT `zugoid_keep_rowid`, `channel_id`, `source_channel_id`, `contact_id`, `status`, `assignee_id`, `identity_id`, `last_message_at`, `created_at`, `updated_at` FROM `zugoid_keep_customer_conversations` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `customer_widgets` (rowid, `channel_id`, `public_id`, `name`, `sites_json`, `greeting`, `enabled`, `created_by`, `created_at`, `updated_at`) SELECT `zugoid_keep_rowid`, `channel_id`, `public_id`, `name`, `sites_json`, `greeting`, `enabled`, `created_by`, `created_at`, `updated_at` FROM `zugoid_keep_customer_widgets` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `customer_visitors` (rowid, `id`, `widget_channel_id`, `identity_id`, `token_hash`, `claimed_name`, `claimed_email`, `user_agent`, `country`, `created_at`, `last_seen_at`) SELECT `zugoid_keep_rowid`, `id`, `widget_channel_id`, `identity_id`, `token_hash`, `claimed_name`, `claimed_email`, `user_agent`, `country`, `created_at`, `last_seen_at` FROM `zugoid_keep_customer_visitors` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `customer_widget_messages` (rowid, `message_id`, `conversation_channel_id`, `direction`, `created_at`) SELECT `zugoid_keep_rowid`, `message_id`, `conversation_channel_id`, `direction`, `created_at` FROM `zugoid_keep_customer_widget_messages` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `data_bookmarks` (rowid, `user_id`, `target_type`, `target_id`, `position`, `created_at`) SELECT `zugoid_keep_rowid`, `user_id`, `target_type`, `target_id`, `position`, `created_at` FROM `zugoid_keep_data_bookmarks` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `data_record_requests` (rowid, `principal_id`, `database_id`, `request_id`, `record_id`, `body_hash`) SELECT `zugoid_keep_rowid`, `principal_id`, `database_id`, `request_id`, `record_id`, `body_hash` FROM `zugoid_keep_data_record_requests` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `data_references` (rowid, `source_type`, `source_id`, `target_type`, `target_id`, `created_by`, `created_at`) SELECT `zugoid_keep_rowid`, `source_type`, `source_id`, `target_type`, `target_id`, `created_by`, `created_at` FROM `zugoid_keep_data_references` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `database_fields` (rowid, `id`, `deleted_at`, `database_id`, `name`, `type`, `slot`, `config_json`, `position`, `created_by`, `created_at`, `updated_at`) SELECT `zugoid_keep_rowid`, `id`, `deleted_at`, `database_id`, `name`, `type`, `slot`, `config_json`, `position`, `created_by`, `created_at`, `updated_at` FROM `zugoid_keep_database_fields` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `database_item_links` (rowid, `id`, `field_id`, `item_id`, `target_item_id`, `position`, `created_at`) SELECT `zugoid_keep_rowid`, `id`, `field_id`, `item_id`, `target_item_id`, `position`, `created_at` FROM `zugoid_keep_database_item_links` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `database_views` (rowid, `id`, `deleted_at`, `database_id`, `name`, `layout`, `config_json`, `position`, `version`, `created_by`, `created_at`, `updated_at`) SELECT `zugoid_keep_rowid`, `id`, `deleted_at`, `database_id`, `name`, `layout`, `config_json`, `position`, `version`, `created_by`, `created_at`, `updated_at` FROM `zugoid_keep_database_views` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `document_revisions` (rowid, `document_id`, `version`, `title`, `content`, `saved_at`) SELECT `zugoid_keep_rowid`, `document_id`, `version`, `title`, `content`, `saved_at` FROM `zugoid_keep_document_revisions` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `email_mailboxes` (rowid, `channel_id`, `domain_id`, `local_part`, `display_name`, `enabled`, `created_at`, `updated_at`) SELECT `zugoid_keep_rowid`, `channel_id`, `domain_id`, `local_part`, `display_name`, `enabled`, `created_at`, `updated_at` FROM `zugoid_keep_email_mailboxes` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `email_threads` (rowid, `channel_id`, `mailbox_channel_id`, `subject`, `participants_json`, `created_at`, `updated_at`) SELECT `zugoid_keep_rowid`, `channel_id`, `mailbox_channel_id`, `subject`, `participants_json`, `created_at`, `updated_at` FROM `zugoid_keep_email_threads` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `email_messages` (rowid, `message_id`, `thread_channel_id`, `direction`, `from_address`, `from_name`, `to_json`, `cc_json`, `bcc_json`, `rfc_message_id`, `provider_message_id`, `delivery_started_at`, `reply_to_json`, `in_reply_to`, `references_json`, `delivery_status`, `raw_r2_key`, `created_at`, `mailbox_channel_id`, `client_request_id`, `delivery_attempts`, `delivery_error`, `delivered_at`, `auth_verdict`, `body_format`) SELECT `zugoid_keep_rowid`, `message_id`, `thread_channel_id`, `direction`, `from_address`, `from_name`, `to_json`, `cc_json`, `bcc_json`, `rfc_message_id`, `provider_message_id`, `delivery_started_at`, `reply_to_json`, `in_reply_to`, `references_json`, `delivery_status`, `raw_r2_key`, `created_at`, `mailbox_channel_id`, `client_request_id`, `delivery_attempts`, `delivery_error`, `delivered_at`, `auth_verdict`, `body_format` FROM `zugoid_keep_email_messages` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `factory_boxes` (rowid, `id`, `channel_id`, `task_id`, `agent_id`, `initiated_by`, `node_id`, `environment_json`, `origin_run_id`, `run_id`, `status`, `lease_token`, `lease_until`, `cpu`, `memory_mib`, `checkpoint_sha`, `head_sha`, `pull_json`, `pushed_sha`, `runtime_ms`, `publication_count`, `created_at`, `updated_at`) SELECT `zugoid_keep_rowid`, `id`, `channel_id`, `task_id`, `agent_id`, `initiated_by`, `node_id`, `environment_json`, `origin_run_id`, `run_id`, `status`, `lease_token`, `lease_until`, `cpu`, `memory_mib`, `checkpoint_sha`, `head_sha`, `pull_json`, `pushed_sha`, `runtime_ms`, `publication_count`, `created_at`, `updated_at` FROM `zugoid_keep_factory_boxes` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `factory_approvals` (rowid, `id`, `box_id`, `run_id`, `call_id`, `kind`, `request_json`, `digest`, `status`, `diff_key`, `diff_digest`, `decided_by`, `decided_at`, `expires_at`, `result_json`, `created_at`) SELECT `zugoid_keep_rowid`, `id`, `box_id`, `run_id`, `call_id`, `kind`, `request_json`, `digest`, `status`, `diff_key`, `diff_digest`, `decided_by`, `decided_at`, `expires_at`, `result_json`, `created_at` FROM `zugoid_keep_factory_approvals` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `gadgets` (rowid, `space_id`, `id`, `name`, `description`, `draft_spec_json`, `draft_revision`, `published_version`, `position`, `created_by`, `created_at`, `updated_at`) SELECT `zugoid_keep_rowid`, `space_id`, `id`, `name`, `description`, `draft_spec_json`, `draft_revision`, `published_version`, `position`, `created_by`, `created_at`, `updated_at` FROM `zugoid_keep_gadgets` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `gadget_versions` (rowid, `id`, `gadget_id`, `version`, `name`, `description`, `spec_json`, `created_by`, `created_at`) SELECT `zugoid_keep_rowid`, `id`, `gadget_id`, `version`, `name`, `description`, `spec_json`, `created_by`, `created_at` FROM `zugoid_keep_gadget_versions` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `git_connections` (rowid, `id`, `name`, `provider`, `host`, `account`, `app_id`, `app_slug`, `credential_json`, `enabled`, `created_by`, `created_at`, `updated_at`) SELECT `zugoid_keep_rowid`, `id`, `name`, `provider`, `host`, `account`, `app_id`, `app_slug`, `credential_json`, `enabled`, `created_by`, `created_at`, `updated_at` FROM `zugoid_keep_git_connections` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `git_setup_requests` (rowid, `state_hash`, `name`, `account`, `actor_id`, `origin`, `status`, `created_at`, `expires_at`) SELECT `zugoid_keep_rowid`, `state_hash`, `name`, `account`, `actor_id`, `origin`, `status`, `created_at`, `expires_at` FROM `zugoid_keep_git_setup_requests` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `server` (rowid, `id`, `singleton`, `name`, `icon_r2_key`, `owner_id`, `created_at`, `updated_at`) SELECT `zugoid_keep_rowid`, `id`, `singleton`, `name`, `icon_r2_key`, `owner_id`, `created_at`, `updated_at` FROM `zugoid_keep_server` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `mcp_outbound_connections` (rowid, `space_id`, `id`, `server_id`, `owner_id`, `created_by`, `name`, `provider_id`, `endpoint`, `description`, `auth_kind`, `enabled`, `revision`, `tool_names_json`, `tools_json`, `credential_json`, `credential_expires_at`, `checked_at`, `last_error`, `created_at`, `updated_at`) SELECT `zugoid_keep_rowid`, `space_id`, `id`, `server_id`, `owner_id`, `created_by`, `name`, `provider_id`, `endpoint`, `description`, `auth_kind`, `enabled`, `revision`, `tool_names_json`, `tools_json`, `credential_json`, `credential_expires_at`, `checked_at`, `last_error`, `created_at`, `updated_at` FROM `zugoid_keep_mcp_outbound_connections` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `project_policies` (rowid, `id`, `name`, `description`, `permissions_bitmask`, `version`, `created_by`, `created_at`, `updated_at`) SELECT `zugoid_keep_rowid`, `id`, `name`, `description`, `permissions_bitmask`, `version`, `created_by`, `created_at`, `updated_at` FROM `zugoid_keep_project_policies` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `grants` (rowid, `id`, `member_id`, `role_id`, `agent_id`, `policy_id`, `permissions`, `project_id`, `channel_id`, `mailbox_id`, `gadget_id`, `gadget_version_id`, `connection_id`, `daily_runs`, `expires_at`, `created_by`, `created_at`) SELECT `zugoid_keep_rowid`, `id`, `member_id`, `role_id`, `agent_id`, `policy_id`, `permissions`, `project_id`, `channel_id`, `mailbox_id`, `gadget_id`, `gadget_version_id`, `connection_id`, `daily_runs`, `expires_at`, `created_by`, `created_at` FROM `zugoid_keep_grants` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `invites` (rowid, `space_id`, `code`, `creator_id`, `max_uses`, `uses`, `expires_at`, `created_at`, `project_id`, `policy_id`) SELECT `zugoid_keep_rowid`, `space_id`, `code`, `creator_id`, `max_uses`, `uses`, `expires_at`, `created_at`, `project_id`, `policy_id` FROM `zugoid_keep_invites` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `mail_drafts` (rowid, `id`, `mailbox_channel_id`, `thread_channel_id`, `author_id`, `to_json`, `cc_json`, `bcc_json`, `subject`, `content`, `body_format`, `attachment_ids_json`, `created_at`, `updated_at`) SELECT `zugoid_keep_rowid`, `id`, `mailbox_channel_id`, `thread_channel_id`, `author_id`, `to_json`, `cc_json`, `bcc_json`, `subject`, `content`, `body_format`, `attachment_ids_json`, `created_at`, `updated_at` FROM `zugoid_keep_mail_drafts` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `spaces` (rowid, `id`, `name`, `description`, `is_default`, `storage_limit_bytes`, `member_limit`, `agent_limit`, `monthly_run_limit`, `monthly_email_limit`, `monthly_voice_limit`, `suspended_at`, `action_limits_json`, `created_by`, `created_at`, `updated_at`) SELECT `zugoid_keep_rowid`, `id`, `name`, `description`, `is_default`, `storage_limit_bytes`, `member_limit`, `agent_limit`, `monthly_run_limit`, `monthly_email_limit`, `monthly_voice_limit`, `suspended_at`, `action_limits_json`, `created_by`, `created_at`, `updated_at` FROM `zugoid_keep_spaces` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `mcp_access_tokens` (rowid, `id`, `name`, `token_hash`, `token_prefix`, `scopes_json`, `subject_id`, `created_by`, `last_used_at`, `revoked_at`, `space_id`, `board_id`, `created_at`, `updated_at`) SELECT `zugoid_keep_rowid`, `id`, `name`, `token_hash`, `token_prefix`, `scopes_json`, `subject_id`, `created_by`, `last_used_at`, `revoked_at`, `space_id`, `board_id`, `created_at`, `updated_at` FROM `zugoid_keep_mcp_access_tokens` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `mcp_oauth_connections` (rowid, `id`, `client_id`, `subject_id`, `created_by`, `resource`, `scopes_json`, `created_at`, `last_used_at`, `revoked_at`) SELECT `zugoid_keep_rowid`, `id`, `client_id`, `subject_id`, `created_by`, `resource`, `scopes_json`, `created_at`, `last_used_at`, `revoked_at` FROM `zugoid_keep_mcp_oauth_connections` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `message_mentions` (rowid, `message_id`, `user_id`, `role_id`) SELECT `zugoid_keep_rowid`, `message_id`, `user_id`, `role_id` FROM `zugoid_keep_message_mentions` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `message_pins` (rowid, `message_id`, `pinned_by`, `pinned_at`) SELECT `zugoid_keep_rowid`, `message_id`, `pinned_by`, `pinned_at` FROM `zugoid_keep_message_pins` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `message_reactions` (rowid, `message_id`, `user_id`, `emoji`, `created_at`) SELECT `zugoid_keep_rowid`, `message_id`, `user_id`, `emoji`, `created_at` FROM `zugoid_keep_message_reactions` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `push_subscriptions` (rowid, `id`, `user_id`, `endpoint`, `p256dh`, `auth`, `user_agent`, `created_at`, `updated_at`) SELECT `zugoid_keep_rowid`, `id`, `user_id`, `endpoint`, `p256dh`, `auth`, `user_agent`, `created_at`, `updated_at` FROM `zugoid_keep_push_subscriptions` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `notification_outbox` (rowid, `event_id`, `subscription_id`, `recipient_id`, `kind`, `channel_id`, `payload_json`, `attempts`, `available_at`, `lease_token`, `lease_until`, `delivered_at`, `failed_at`, `last_error`, `created_at`) SELECT `zugoid_keep_rowid`, `event_id`, `subscription_id`, `recipient_id`, `kind`, `channel_id`, `payload_json`, `attempts`, `available_at`, `lease_token`, `lease_until`, `delivered_at`, `failed_at`, `last_error`, `created_at` FROM `zugoid_keep_notification_outbox` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `project_repositories` (rowid, `id`, `project_id`, `provider`, `host`, `external_id`, `slug`, `default_branch`, `environment_id`, `created_by`, `created_at`) SELECT `zugoid_keep_rowid`, `id`, `project_id`, `provider`, `host`, `external_id`, `slug`, `default_branch`, `environment_id`, `created_by`, `created_at` FROM `zugoid_keep_project_repositories` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `project_releases` (rowid, `id`, `project_id`, `repository_id`, `repository`, `tag`, `version`, `sha`, `message`, `created_by`, `created_at`) SELECT `zugoid_keep_rowid`, `id`, `project_id`, `repository_id`, `repository`, `tag`, `version`, `sha`, `message`, `created_by`, `created_at` FROM `zugoid_keep_project_releases` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `project_secrets` (rowid, `id`, `project_id`, `name`, `placeholder`, `hosts_json`, `secret_ciphertext`, `secret_iv`, `secret_version`, `created_by`, `created_at`, `updated_at`, `last_used_at`) SELECT `zugoid_keep_rowid`, `id`, `project_id`, `name`, `placeholder`, `hosts_json`, `secret_ciphertext`, `secret_iv`, `secret_version`, `created_by`, `created_at`, `updated_at`, `last_used_at` FROM `zugoid_keep_project_secrets` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `role_policies` (rowid, `role_id`, `policy_id`) SELECT `zugoid_keep_rowid`, `role_id`, `policy_id` FROM `zugoid_keep_role_policies` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `server_domain_requests` (rowid, `id`, `action`, `hostname`, `token_hash`, `status`, `error`, `created_at`, `updated_at`) SELECT `zugoid_keep_rowid`, `id`, `action`, `hostname`, `token_hash`, `status`, `error`, `created_at`, `updated_at` FROM `zugoid_keep_server_domain_requests` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `space_members` (rowid, `space_id`, `user_id`, `role`, `joined_at`) SELECT `zugoid_keep_rowid`, `space_id`, `user_id`, `role`, `joined_at` FROM `zugoid_keep_space_members` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `space_stats` (rowid, `space_id`, `people`, `projects`, `tasks`, `recordings`, `storage_bytes`, `messages`, `last_activity_at`, `refreshed_at`) SELECT `zugoid_keep_rowid`, `space_id`, `people`, `projects`, `tasks`, `recordings`, `storage_bytes`, `messages`, `last_activity_at`, `refreshed_at` FROM `zugoid_keep_space_stats` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `space_task_counters` (rowid, `space_id`, `last`) SELECT `zugoid_keep_rowid`, `space_id`, `last` FROM `zugoid_keep_space_task_counters` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `space_usage` (rowid, `space_id`, `metric`, `period`, `count`) SELECT `zugoid_keep_rowid`, `space_id`, `metric`, `period`, `count` FROM `zugoid_keep_space_usage` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `task_checklist_items` (rowid, `id`, `task_id`, `title`, `completed`, `position`, `created_by`, `created_at`, `updated_at`) SELECT `zugoid_keep_rowid`, `id`, `task_id`, `title`, `completed`, `position`, `created_by`, `created_at`, `updated_at` FROM `zugoid_keep_task_checklist_items` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `task_dependencies` (rowid, `task_id`, `depends_on_task_id`, `created_at`) SELECT `zugoid_keep_rowid`, `task_id`, `depends_on_task_id`, `created_at` FROM `zugoid_keep_task_dependencies` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `task_labels` (rowid, `id`, `board_id`, `name`, `color`, `position`, `created_by`, `created_at`, `updated_at`) SELECT `zugoid_keep_rowid`, `id`, `board_id`, `name`, `color`, `position`, `created_by`, `created_at`, `updated_at` FROM `zugoid_keep_task_labels` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `task_label_links` (rowid, `task_id`, `label_id`) SELECT `zugoid_keep_rowid`, `task_id`, `label_id` FROM `zugoid_keep_task_label_links` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
INSERT INTO `task_numbers` (rowid, `task_id`, `number`, `space_id`) SELECT `zugoid_keep_rowid`, `task_id`, `number`, `space_id` FROM `zugoid_keep_task_numbers` ORDER BY `zugoid_keep_rowid`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_users`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_agent_environments`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_channels`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_messages`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_task_attachments`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_task_boards`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_projects`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_tasks`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_agents`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_agent_sessions`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_agent_runs`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_agent_code_proposals`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_agent_model_calls`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_agent_run_deliveries`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_agent_run_events`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_agent_run_publications`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_agent_run_tools`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_agent_schedules`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_agent_schedule_occurrences`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_agent_tool_decisions`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_agent_turns`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_agent_webhooks`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_attachments`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_audit_log`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_auth_provider_credentials`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_auth_settings`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_database_definitions`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_data_items`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_canvas_nodes`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_canvas_edges`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_channel_attention`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_channel_members`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_channel_reads`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_channel_role_denies`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_compute_nodes`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_compute_pairings`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_customer_companies`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_customer_company_domains`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_customer_contacts`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_customer_contact_companies`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_customer_identities`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_customer_sources`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_customer_conversations`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_customer_widgets`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_customer_visitors`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_customer_widget_messages`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_data_bookmarks`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_data_record_requests`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_data_references`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_database_fields`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_database_item_links`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_database_views`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_document_revisions`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_email_mailboxes`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_email_threads`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_email_messages`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_factory_boxes`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_factory_approvals`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_gadgets`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_gadget_versions`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_git_connections`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_git_setup_requests`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_server`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_mcp_outbound_connections`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_project_policies`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_grants`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_invites`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_mail_drafts`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_spaces`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_mcp_access_tokens`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_mcp_oauth_connections`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_message_mentions`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_message_pins`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_message_reactions`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_push_subscriptions`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_notification_outbox`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_project_repositories`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_project_releases`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_project_secrets`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_role_policies`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_server_domain_requests`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_space_members`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_space_stats`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_space_task_counters`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_space_usage`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_task_checklist_items`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_task_dependencies`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_task_labels`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_task_label_links`;
--> statement-breakpoint
DROP TABLE `zugoid_keep_task_numbers`;
--> statement-breakpoint
CREATE INDEX `agent_environments_space_idx` ON `agent_environments` (`space_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_run_publications_message_id_unique` ON `agent_run_publications` (`message_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_run_publication_active` ON `agent_run_publications` (`run_id`) WHERE "agent_run_publications"."status" IN ('pending','executing','completed','uncertain');
--> statement-breakpoint
CREATE INDEX `agent_run_publication_history` ON `agent_run_publications` (`run_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `agent_runs_session_status` ON `agent_runs` (`session_id`,`status`,`created_at`);
--> statement-breakpoint
CREATE INDEX agent_runs_root ON agent_runs(COALESCE(json_extract(mandate_json,'$.rootRunId'),id));
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_runs_agent_id_initiated_by_idempotency_key_unique` ON `agent_runs` (`agent_id`,`initiated_by`,`idempotency_key`);
--> statement-breakpoint
CREATE INDEX `agent_schedules_created_by_status_idx` ON `agent_schedules` (`created_by`,`status`,`next_at`);
--> statement-breakpoint
CREATE INDEX `agent_schedules_principal_status_idx` ON `agent_schedules` (`principal_id`,`status`,`next_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_sessions_agent_id_channel_id_unique` ON `agent_sessions` (`agent_id`,`channel_id`);
--> statement-breakpoint
CREATE INDEX `agent_turns_channel_agent_idx` ON `agent_turns` (`channel_id`,`agent_id`,`created_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_turns_request_id_unique` ON `agent_turns` (`request_id`);
--> statement-breakpoint
CREATE INDEX `agents_status_idx` ON `agents` (`status`);
--> statement-breakpoint
CREATE UNIQUE INDEX `attachments_r2_key_unique` ON `attachments` (`r2_key`);
--> statement-breakpoint
CREATE INDEX `attachments_message_id_idx` ON `attachments` (`message_id`);
--> statement-breakpoint
CREATE INDEX `attachments_channel_id_idx` ON `attachments` (`channel_id`);
--> statement-breakpoint
CREATE INDEX `attachments_uploader_id_idx` ON `attachments` (`uploader_id`);
--> statement-breakpoint
CREATE INDEX `audit_log_created_at_idx` ON `audit_log` (`created_at`);
--> statement-breakpoint
CREATE INDEX `audit_log_actor_id_idx` ON `audit_log` (`actor_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `canvas_edges_nodes_unique` ON `canvas_edges` (`canvas_id`,`from_node_id`,`to_node_id`);
--> statement-breakpoint
CREATE INDEX `canvas_edges_canvas_idx` ON `canvas_edges` (`canvas_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `canvas_nodes_canvas_idx` ON `canvas_nodes` (`canvas_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `channel_attention_user_idx` ON `channel_attention` (`user_id`,`following`);
--> statement-breakpoint
CREATE INDEX `channel_members_user_id_idx` ON `channel_members` (`user_id`);
--> statement-breakpoint
CREATE INDEX `channel_reads_user_id_idx` ON `channel_reads` (`user_id`);
--> statement-breakpoint
CREATE INDEX `channels_position_idx` ON `channels` (`position`);
--> statement-breakpoint
CREATE INDEX `channels_type_idx` ON `channels` (`type`);
--> statement-breakpoint
CREATE INDEX `channels_category_id_idx` ON `channels` (`category_id`);
--> statement-breakpoint
CREATE INDEX `channels_parent_id_idx` ON `channels` (`parent_id`);
--> statement-breakpoint
CREATE INDEX `channels_section_type_idx` ON `channels` (`section`,`type`);
--> statement-breakpoint
CREATE UNIQUE INDEX `channels_thread_root_unique` ON `channels` (`parent_message_id`) WHERE "channels"."type" = 'thread';
--> statement-breakpoint
CREATE UNIQUE INDEX `channels_dm_pair_key_unique` ON `channels` (`dm_pair_key`) WHERE "channels"."dm_pair_key" is not null;
--> statement-breakpoint
CREATE INDEX `channels_space_idx` ON `channels` (`space_id`);
--> statement-breakpoint
CREATE INDEX `customer_companies_space_name_idx` ON `customer_companies` (`space_id`,`name`);
--> statement-breakpoint
CREATE INDEX `customer_company_domains_company_idx` ON `customer_company_domains` (`company_id`);
--> statement-breakpoint
CREATE INDEX `customer_contact_companies_company_idx` ON `customer_contact_companies` (`company_id`,`current`);
--> statement-breakpoint
CREATE INDEX `customer_contacts_space_seen_idx` ON `customer_contacts` (`space_id`,`last_seen_at`);
--> statement-breakpoint
CREATE INDEX `customer_contacts_space_name_idx` ON `customer_contacts` (`space_id`,`name`);
--> statement-breakpoint
CREATE INDEX `customer_conversations_identity_idx` ON `customer_conversations` (`identity_id`,`source_channel_id`,`last_message_at`);
--> statement-breakpoint
CREATE INDEX `customer_conversations_source_status_latest_idx` ON `customer_conversations` (`source_channel_id`,`status`,`last_message_at`);
--> statement-breakpoint
CREATE INDEX `customer_conversations_contact_latest_idx` ON `customer_conversations` (`contact_id`,`last_message_at`);
--> statement-breakpoint
CREATE INDEX `customer_conversations_assignee_idx` ON `customer_conversations` (`assignee_id`,`status`);
--> statement-breakpoint
CREATE UNIQUE INDEX `customer_identities_value_unique` ON `customer_identities` (`space_id`,`kind`,`value`);
--> statement-breakpoint
CREATE INDEX `customer_identities_contact_idx` ON `customer_identities` (`contact_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `customer_telegram_bots_bot_unique` ON `customer_telegram_bots` (`bot_id`);
--> statement-breakpoint
CREATE INDEX `customer_telegram_messages_conversation_idx` ON `customer_telegram_messages` (`conversation_channel_id`,`message_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `customer_visitors_token_hash_unique` ON `customer_visitors` (`token_hash`);
--> statement-breakpoint
CREATE INDEX `customer_visitors_widget_idx` ON `customer_visitors` (`widget_channel_id`,`last_seen_at`);
--> statement-breakpoint
CREATE INDEX `customer_visitors_identity_idx` ON `customer_visitors` (`identity_id`);
--> statement-breakpoint
CREATE INDEX `customer_widget_messages_conversation_idx` ON `customer_widget_messages` (`conversation_channel_id`,`message_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `customer_widgets_public_id_unique` ON `customer_widgets` (`public_id`);
--> statement-breakpoint
CREATE INDEX `data_bookmarks_user_position_idx` ON `data_bookmarks` (`user_id`,`position`,`created_at`);
--> statement-breakpoint
CREATE INDEX `data_items_parent_idx` ON `data_items` (`space_id`,`parent_id`,`position`);
--> statement-breakpoint
CREATE INDEX `data_items_parent_id_idx` ON `data_items` (`parent_id`);
--> statement-breakpoint
CREATE INDEX `database_items_database_position_idx` ON `data_items` (`database_id`,`position`);
--> statement-breakpoint
CREATE INDEX `database_items_active_position_idx` ON `data_items` (`database_id`,`position`,`created_at`,`id`) WHERE "data_items"."deleted_at" is null;
--> statement-breakpoint
CREATE INDEX `data_references_target_idx` ON `data_references` (`target_type`,`target_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `database_definitions_name_unique` ON `database_definitions` (`space_id`,lower("name"));
--> statement-breakpoint
CREATE INDEX `database_definitions_position_idx` ON `database_definitions` (`position`);
--> statement-breakpoint
CREATE INDEX `database_definitions_space_idx` ON `database_definitions` (`space_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `database_fields_name_unique` ON `database_fields` (`database_id`,`name`);
--> statement-breakpoint
CREATE UNIQUE INDEX `database_fields_slot_unique` ON `database_fields` (`database_id`,`slot`);
--> statement-breakpoint
CREATE INDEX `database_fields_position_idx` ON `database_fields` (`database_id`,`position`);
--> statement-breakpoint
CREATE UNIQUE INDEX `database_item_links_unique` ON `database_item_links` (`field_id`,`item_id`,`target_item_id`);
--> statement-breakpoint
CREATE INDEX `database_item_links_item_idx` ON `database_item_links` (`item_id`,`field_id`,`position`);
--> statement-breakpoint
CREATE INDEX `database_item_links_target_idx` ON `database_item_links` (`target_item_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `database_views_name_unique` ON `database_views` (`database_id`,`name`);
--> statement-breakpoint
CREATE INDEX `database_views_database_position_idx` ON `database_views` (`database_id`,`position`);
--> statement-breakpoint
CREATE UNIQUE INDEX `email_mailboxes_address_unique` ON `email_mailboxes` (`domain_id`,`local_part`);
--> statement-breakpoint
CREATE UNIQUE INDEX `email_messages_mailbox_rfc_message_id_unique` ON `email_messages` (`mailbox_channel_id`,`rfc_message_id`) WHERE "email_messages"."rfc_message_id" is not null;
--> statement-breakpoint
CREATE UNIQUE INDEX `email_messages_mailbox_client_request_unique` ON `email_messages` (`mailbox_channel_id`,`client_request_id`) WHERE "email_messages"."client_request_id" is not null;
--> statement-breakpoint
CREATE INDEX `email_messages_thread_created_idx` ON `email_messages` (`thread_channel_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `email_threads_mailbox_idx` ON `email_threads` (`mailbox_channel_id`);
--> statement-breakpoint
CREATE INDEX `factory_approvals_box` ON `factory_approvals` (`box_id`,`status`);
--> statement-breakpoint
CREATE UNIQUE INDEX `factory_approvals_run_id_call_id_unique` ON `factory_approvals` (`run_id`,`call_id`);
--> statement-breakpoint
CREATE INDEX `factory_boxes_node` ON `factory_boxes` (`node_id`,`status`);
--> statement-breakpoint
CREATE INDEX `factory_boxes_run` ON `factory_boxes` (`run_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `factory_boxes_task_id_agent_id_initiated_by_unique` ON `factory_boxes` (`task_id`,`agent_id`,`initiated_by`);
--> statement-breakpoint
CREATE UNIQUE INDEX `gadget_versions_number_unique` ON `gadget_versions` (`gadget_id`,`version`);
--> statement-breakpoint
CREATE INDEX `gadgets_position_idx` ON `gadgets` (`position`,`created_at`);
--> statement-breakpoint
CREATE INDEX `gadgets_space_idx` ON `gadgets` (`space_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX grants_member_identity ON grants(member_id,coalesce(agent_id,''),coalesce(project_id,''),policy_id) WHERE member_id IS NOT NULL AND policy_id IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX grants_role_identity ON grants(role_id,coalesce(agent_id,''),coalesce(project_id,''),policy_id) WHERE role_id IS NOT NULL AND policy_id IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `grants_channel_identity` ON `grants` (`channel_id`,`role_id`) WHERE "grants"."channel_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `grants_mailbox_identity` ON `grants` (`mailbox_id`,`member_id`) WHERE "grants"."mailbox_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `grants_gadget_identity` ON `grants` (`gadget_id`,`role_id`) WHERE "grants"."gadget_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `grants_gadget_version_identity` ON `grants` (`gadget_version_id`,`role_id`) WHERE "grants"."gadget_version_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX grants_connection_identity ON grants(connection_id,coalesce(member_id,''),coalesce(role_id,'')) WHERE connection_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX `grants_member` ON `grants` (`member_id`,`agent_id`,`project_id`);
--> statement-breakpoint
CREATE INDEX `grants_role` ON `grants` (`role_id`,`agent_id`,`project_id`);
--> statement-breakpoint
CREATE INDEX `grants_project` ON `grants` (`project_id`);
--> statement-breakpoint
CREATE INDEX `grants_member_mailbox` ON `grants` (`member_id`,`mailbox_id`) WHERE "grants"."mailbox_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX `invites_creator_id_idx` ON `invites` (`creator_id`);
--> statement-breakpoint
CREATE INDEX `invites_expires_at_idx` ON `invites` (`expires_at`);
--> statement-breakpoint
CREATE INDEX `mail_drafts_author_mailbox_idx` ON `mail_drafts` (`author_id`,`mailbox_channel_id`,`updated_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `mail_drafts_author_thread_unique` ON `mail_drafts` (`author_id`,`thread_channel_id`) WHERE "mail_drafts"."thread_channel_id" is not null;
--> statement-breakpoint
CREATE UNIQUE INDEX `mcp_access_tokens_hash_unique` ON `mcp_access_tokens` (`token_hash`);
--> statement-breakpoint
CREATE INDEX `mcp_access_tokens_subject_id_idx` ON `mcp_access_tokens` (`subject_id`);
--> statement-breakpoint
CREATE INDEX `mcp_access_tokens_created_by_idx` ON `mcp_access_tokens` (`created_by`);
--> statement-breakpoint
CREATE INDEX `mcp_access_tokens_active_idx` ON `mcp_access_tokens` (`revoked_at`,`created_at`);
--> statement-breakpoint
CREATE INDEX `mcp_access_tokens_recording_keys_idx` ON `mcp_access_tokens` (`created_by`) WHERE "mcp_access_tokens"."space_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX `mcp_oauth_connections_created_by_idx` ON `mcp_oauth_connections` (`created_by`);
--> statement-breakpoint
CREATE INDEX `mcp_oauth_connections_subject_id_idx` ON `mcp_oauth_connections` (`subject_id`);
--> statement-breakpoint
CREATE INDEX `mcp_outbound_server_owner` ON `mcp_outbound_connections` (`server_id`,`owner_id`);
--> statement-breakpoint
CREATE INDEX `mcp_outbound_connections_space_idx` ON `mcp_outbound_connections` (`space_id`);
--> statement-breakpoint
CREATE INDEX `message_mentions_user_id_idx` ON `message_mentions` (`user_id`);
--> statement-breakpoint
CREATE INDEX `message_pins_pinned_by_idx` ON `message_pins` (`pinned_by`);
--> statement-breakpoint
CREATE INDEX `message_pins_pinned_at_idx` ON `message_pins` (`pinned_at`);
--> statement-breakpoint
CREATE INDEX `message_reactions_user_id_idx` ON `message_reactions` (`user_id`);
--> statement-breakpoint
CREATE INDEX `messages_channel_created_idx` ON `messages` (`channel_id`,`created_at`,`id`);
--> statement-breakpoint
CREATE INDEX `messages_channel_id_idx` ON `messages` (`channel_id`,`id`);
--> statement-breakpoint
CREATE INDEX `messages_author_id_idx` ON `messages` (`author_id`);
--> statement-breakpoint
CREATE INDEX `messages_live_channel_id_idx` ON `messages` (`channel_id`,`id`) WHERE "messages"."deleted_at" is null;
--> statement-breakpoint
CREATE INDEX `notification_outbox_due_idx` ON `notification_outbox` (`available_at`) WHERE "notification_outbox"."delivered_at" is null and "notification_outbox"."failed_at" is null;
--> statement-breakpoint
CREATE UNIQUE INDEX `project_policies_name_unique` ON `project_policies` (`name`);
--> statement-breakpoint
CREATE INDEX `project_releases_project` ON `project_releases` (`project_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_releases_project_id_tag_unique` ON `project_releases` (`project_id`,`tag`);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_repositories_environment_id_unique` ON `project_repositories` (`environment_id`);
--> statement-breakpoint
CREATE INDEX `project_repositories_project` ON `project_repositories` (`project_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_repositories_project_id_provider_host_external_id_unique` ON `project_repositories` (`project_id`,`provider`,`host`,`external_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_secrets_project_id_name_unique` ON `project_secrets` (`project_id`,`name`);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_secrets_project_id_placeholder_unique` ON `project_secrets` (`project_id`,`placeholder`);
--> statement-breakpoint
CREATE INDEX `projects_space_idx` ON `projects` (`space_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscriptions_endpoint_unique` ON `push_subscriptions` (`endpoint`);
--> statement-breakpoint
CREATE INDEX `push_subscriptions_user_id_idx` ON `push_subscriptions` (`user_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `server_singleton_idx` ON `server` (`singleton`);
--> statement-breakpoint
CREATE INDEX `server_domain_requests_status_idx` ON `server_domain_requests` (`status`,`created_at`);
--> statement-breakpoint
CREATE INDEX `space_members_user_idx` ON `space_members` (`user_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `spaces_one_default` ON `spaces` (`is_default`) WHERE "spaces"."is_default" = 1;
--> statement-breakpoint
CREATE UNIQUE INDEX `task_attachments_r2_key_unique` ON `task_attachments` (`r2_key`);
--> statement-breakpoint
CREATE INDEX `task_attachments_task_created_idx` ON `task_attachments` (`task_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `task_attachments_source_idx` ON `task_attachments` (`source_id`);
--> statement-breakpoint
CREATE INDEX `task_boards_position_idx` ON `task_boards` (`position`);
--> statement-breakpoint
CREATE INDEX `task_boards_space_idx` ON `task_boards` (`space_id`);
--> statement-breakpoint
CREATE INDEX `task_checklist_items_task_position_idx` ON `task_checklist_items` (`task_id`,`position`);
--> statement-breakpoint
CREATE INDEX `task_dependencies_depends_on_idx` ON `task_dependencies` (`depends_on_task_id`);
--> statement-breakpoint
CREATE INDEX `task_label_links_label_idx` ON `task_label_links` (`label_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `task_labels_board_name_unique` ON `task_labels` (`board_id`,`name`);
--> statement-breakpoint
CREATE INDEX `task_labels_board_position_idx` ON `task_labels` (`board_id`,`position`);
--> statement-breakpoint
CREATE UNIQUE INDEX `task_numbers_space_number_unique` ON `task_numbers` (`space_id`,`number`);
--> statement-breakpoint
CREATE INDEX `tasks_parent_idx` ON `tasks` (`parent_task_id`);
--> statement-breakpoint
CREATE INDEX `tasks_board_status_position_idx` ON `tasks` (`board_id`,`status`,`position`);
--> statement-breakpoint
CREATE INDEX `tasks_assignee_id_idx` ON `tasks` (`assignee_id`);
--> statement-breakpoint
CREATE INDEX `tasks_source_message_idx` ON `tasks` (`source_channel_id`,`source_message_id`) WHERE "tasks"."source_message_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `tasks_discussion_channel_unique` ON `tasks` (`discussion_channel_id`) WHERE "tasks"."discussion_channel_id" is not null;
--> statement-breakpoint
CREATE INDEX `tasks_project` ON `tasks` (`project_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_handle_unique` ON `users` (`handle`);
--> statement-breakpoint
CREATE INDEX `users_status_idx` ON `users` (`status`);
--> statement-breakpoint
CREATE INDEX `users_kind_idx` ON `users` (`kind`);
--> statement-breakpoint
CREATE INDEX `users_role_id_idx` ON `users` (`role_id`);
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
CREATE TRIGGER channels_thread_inherits_space AFTER INSERT ON channels WHEN NEW.parent_id IS NOT NULL BEGIN UPDATE channels SET space_id = (SELECT space_id FROM channels WHERE id = NEW.parent_id), section = (SELECT section FROM channels WHERE id = NEW.parent_id) WHERE id = NEW.id; END;
--> statement-breakpoint
CREATE TRIGGER `tasks_assign_number_after_insert` AFTER INSERT ON `tasks` WHEN NOT EXISTS (SELECT 1 FROM `task_numbers` WHERE `task_id` = NEW.`id`) BEGIN INSERT INTO `space_task_counters` (`space_id`, `last`) SELECT `space_id`, 1 FROM `task_boards` WHERE `id` = NEW.`board_id` ON CONFLICT (`space_id`) DO UPDATE SET `last` = `last` + 1; INSERT INTO `task_numbers` (`task_id`, `number`, `space_id`) SELECT NEW.`id`, `c`.`last`, `c`.`space_id` FROM `space_task_counters` `c` JOIN `task_boards` `b` ON `b`.`space_id` = `c`.`space_id` WHERE `b`.`id` = NEW.`board_id`; END;
--> statement-breakpoint
CREATE TRIGGER tasks_hierarchy_insert BEFORE INSERT ON tasks BEGIN SELECT RAISE(ABORT, 'task_hierarchy_boundary') WHERE NEW.parent_task_id IS NOT NULL AND NOT EXISTS ( SELECT 1 FROM tasks p WHERE p.id=NEW.parent_task_id AND p.board_id=NEW.board_id AND p.project_id IS NEW.project_id ); SELECT RAISE(ABORT, 'task_hierarchy_cycle') WHERE NEW.parent_task_id IS NOT NULL AND EXISTS ( WITH RECURSIVE ancestors(id) AS ( SELECT NEW.parent_task_id UNION SELECT t.parent_task_id FROM tasks t JOIN ancestors a ON t.id=a.id WHERE t.parent_task_id IS NOT NULL ) SELECT 1 FROM ancestors WHERE id=NEW.id ); SELECT RAISE(ABORT, 'task_hierarchy_archived') WHERE EXISTS ( SELECT 1 FROM tasks p WHERE p.id=NEW.parent_task_id AND p.archived_at IS NOT NULL ); END;
--> statement-breakpoint
CREATE TRIGGER tasks_hierarchy_update BEFORE UPDATE OF parent_task_id, board_id, project_id ON tasks BEGIN SELECT RAISE(ABORT, 'task_hierarchy_boundary') WHERE NEW.parent_task_id IS NOT NULL AND NOT EXISTS ( SELECT 1 FROM tasks p WHERE p.id=NEW.parent_task_id AND p.board_id=NEW.board_id AND p.project_id IS NEW.project_id ); SELECT RAISE(ABORT, 'task_hierarchy_cycle') WHERE NEW.parent_task_id IS NOT NULL AND EXISTS ( WITH RECURSIVE ancestors(id) AS ( SELECT NEW.parent_task_id UNION SELECT t.parent_task_id FROM tasks t JOIN ancestors a ON t.id=a.id WHERE t.parent_task_id IS NOT NULL ) SELECT 1 FROM ancestors WHERE id=NEW.id ); SELECT RAISE(ABORT, 'task_hierarchy_children') WHERE EXISTS ( SELECT 1 FROM tasks c WHERE c.parent_task_id=NEW.id AND (c.board_id<>NEW.board_id OR c.project_id IS NOT NEW.project_id) ); SELECT RAISE(ABORT, 'task_hierarchy_archived') WHERE NEW.parent_task_id IS NOT OLD.parent_task_id AND EXISTS ( SELECT 1 FROM tasks p WHERE p.id=NEW.parent_task_id AND p.archived_at IS NOT NULL ); END;
--> statement-breakpoint
CREATE TRIGGER email_mailboxes_are_sources AFTER INSERT ON email_mailboxes BEGIN UPDATE channels SET section = 'customers' WHERE id = NEW.channel_id; INSERT OR IGNORE INTO customer_sources(channel_id, kind) VALUES (NEW.channel_id, 'mailbox'); END;
--> statement-breakpoint
CREATE TRIGGER customer_widgets_are_sources BEFORE INSERT ON customer_widgets BEGIN UPDATE channels SET section = 'customers' WHERE id = NEW.channel_id; INSERT OR IGNORE INTO customer_sources(channel_id, kind) VALUES (NEW.channel_id, 'widget'); END;
--> statement-breakpoint
CREATE TRIGGER customer_telegram_bots_are_sources BEFORE INSERT ON customer_telegram_bots BEGIN UPDATE channels SET section = 'customers' WHERE id = NEW.channel_id; INSERT OR IGNORE INTO customer_sources(channel_id, kind) VALUES (NEW.channel_id, 'telegram'); END;
--> statement-breakpoint
CREATE TRIGGER audit_log_finds_space AFTER INSERT ON audit_log WHEN NEW.space_id IS NULL AND NEW.target_type NOT IN ('server', 'user', 'role', 'policy', 'ai_function', 'agent_provider', 'onboarding_revision', 'git_connection', 'mcp_connection') BEGIN UPDATE audit_log SET space_id = COALESCE(CASE NEW.target_type WHEN 'space' THEN NEW.target_id WHEN 'channel' THEN (SELECT space_id FROM channels WHERE id = NEW.target_id) WHEN 'mailbox' THEN (SELECT space_id FROM channels WHERE id = NEW.target_id) WHEN 'email_thread' THEN (SELECT space_id FROM channels WHERE id = NEW.target_id) WHEN 'channel_category' THEN (SELECT space_id FROM channel_categories WHERE id = NEW.target_id) WHEN 'message' THEN (SELECT c.space_id FROM messages m JOIN channels c ON c.id = m.channel_id WHERE m.id = NEW.target_id) WHEN 'project' THEN (SELECT space_id FROM projects WHERE id = NEW.target_id) WHEN 'task_board' THEN (SELECT space_id FROM task_boards WHERE id = NEW.target_id) WHEN 'task' THEN (SELECT b.space_id FROM tasks t JOIN task_boards b ON b.id = t.board_id WHERE t.id = NEW.target_id) WHEN 'task_label' THEN (SELECT b.space_id FROM task_labels l JOIN task_boards b ON b.id = l.board_id WHERE l.id = NEW.target_id) WHEN 'database' THEN (SELECT space_id FROM database_definitions WHERE id = NEW.target_id) WHEN 'database_item' THEN (SELECT d.space_id FROM data_items i JOIN database_definitions d ON d.id = i.database_id WHERE i.id = NEW.target_id) WHEN 'database_field' THEN (SELECT d.space_id FROM database_fields f JOIN database_definitions d ON d.id = f.database_id WHERE f.id = NEW.target_id) WHEN 'database_view' THEN (SELECT d.space_id FROM database_views v JOIN database_definitions d ON d.id = v.database_id WHERE v.id = NEW.target_id) WHEN 'item' THEN (SELECT space_id FROM data_items WHERE id = NEW.target_id) WHEN 'document' THEN (SELECT space_id FROM data_items WHERE id = NEW.target_id) WHEN 'canvas' THEN (SELECT space_id FROM data_items WHERE id = NEW.target_id) WHEN 'canvas_node' THEN (SELECT c.space_id FROM canvas_nodes n JOIN data_items c ON c.id = n.canvas_id WHERE n.id = NEW.target_id) WHEN 'canvas_edge' THEN (SELECT c.space_id FROM canvas_edges e JOIN data_items c ON c.id = e.canvas_id WHERE e.id = NEW.target_id) WHEN 'gadget' THEN (SELECT space_id FROM gadgets WHERE id = NEW.target_id) WHEN 'tool_connection' THEN (SELECT space_id FROM mcp_outbound_connections WHERE id = NEW.target_id) WHEN 'environment' THEN (SELECT space_id FROM agent_environments WHERE id = NEW.target_id) WHEN 'invite' THEN (SELECT space_id FROM invites WHERE code = NEW.target_id) WHEN 'run' THEN (SELECT c.space_id FROM agent_runs r JOIN channels c ON c.id = r.channel_id WHERE r.id = NEW.target_id) WHEN 'agent' THEN (SELECT space_id FROM space_members WHERE user_id = NEW.target_id LIMIT 1) WHEN 'mcp_token' THEN (SELECT m.space_id FROM mcp_access_tokens t JOIN space_members m ON m.user_id = t.subject_id WHERE t.id = NEW.target_id LIMIT 1) WHEN 'customer_contact' THEN (SELECT space_id FROM customer_contacts WHERE id = NEW.target_id) WHEN 'customer_company' THEN (SELECT space_id FROM customer_companies WHERE id = NEW.target_id) WHEN 'customer_conversation' THEN (SELECT space_id FROM channels WHERE id = NEW.target_id) WHEN 'customer_widget' THEN (SELECT space_id FROM channels WHERE id = NEW.target_id) WHEN 'customer_telegram_bot' THEN (SELECT space_id FROM channels WHERE id = NEW.target_id) END, (SELECT MIN(space_id) FROM space_members WHERE user_id = NEW.actor_id HAVING COUNT(*) = 1)) WHERE id = NEW.id; END;
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
