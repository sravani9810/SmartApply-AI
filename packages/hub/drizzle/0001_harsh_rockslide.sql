CREATE TABLE `profile` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `applications` ADD `match` text;--> statement-breakpoint
ALTER TABLE `applications` ADD `used_claude` integer;