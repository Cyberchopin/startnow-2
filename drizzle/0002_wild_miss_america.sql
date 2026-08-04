CREATE TABLE `study_rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`attempt_count` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL
);
