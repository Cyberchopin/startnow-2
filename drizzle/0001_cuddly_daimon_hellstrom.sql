CREATE TABLE `research_decisions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`response_id` integer,
	`user_said` text NOT NULL,
	`we_changed` text NOT NULL,
	`rationale` text NOT NULL,
	`status` text DEFAULT 'planned' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE `study_responses` ADD `category` text DEFAULT 'unclassified' NOT NULL;--> statement-breakpoint
ALTER TABLE `study_responses` ADD `review_status` text DEFAULT 'new' NOT NULL;