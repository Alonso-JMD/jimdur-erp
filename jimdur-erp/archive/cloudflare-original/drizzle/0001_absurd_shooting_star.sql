CREATE TABLE `app_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_email` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`expires_at` text NOT NULL,
	`last_seen_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_email`) REFERENCES `app_users`(`email`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `app_sessions_user_idx` ON `app_sessions` (`user_email`);--> statement-breakpoint
CREATE INDEX `app_sessions_expiry_idx` ON `app_sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `auth_rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`window_started_at` text NOT NULL,
	`locked_until` text
);
--> statement-breakpoint
ALTER TABLE `app_users` ADD `username` text;--> statement-breakpoint
ALTER TABLE `app_users` ADD `password_hash` text;--> statement-breakpoint
ALTER TABLE `app_users` ADD `password_salt` text;--> statement-breakpoint
ALTER TABLE `app_users` ADD `password_iterations` integer DEFAULT 100000 NOT NULL;--> statement-breakpoint
ALTER TABLE `app_users` ADD `must_change_password` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `app_users` ADD `password_updated_at` text;--> statement-breakpoint
CREATE UNIQUE INDEX `app_users_username_unique` ON `app_users` (`username`);--> statement-breakpoint
DELETE FROM `app_users` WHERE `email` = 'screenshot-service@invalid.local' AND `password_hash` IS NULL;
