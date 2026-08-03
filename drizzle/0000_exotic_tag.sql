CREATE TABLE `study_responses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`participant_key` text NOT NULL,
	`relationship` text NOT NULL,
	`usefulness` integer NOT NULL,
	`felt_understood` integer NOT NULL,
	`hardest_step` text NOT NULL,
	`would_return` text NOT NULL,
	`feedback` text NOT NULL,
	`change_request` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `study_responses_participant_key_unique` ON `study_responses` (`participant_key`);