CREATE TABLE `application_bullets` (
	`application_id` text NOT NULL,
	`bullet_id` text NOT NULL,
	PRIMARY KEY(`application_id`, `bullet_id`),
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`bullet_id`) REFERENCES `bullets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `applications` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`resume_id` text,
	`status` text DEFAULT 'new' NOT NULL,
	`applied_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resume_id`) REFERENCES `resumes`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `applications_job_idx` ON `applications` (`job_id`);--> statement-breakpoint
CREATE TABLE `bullet_tags` (
	`bullet_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`bullet_id`, `tag_id`),
	FOREIGN KEY (`bullet_id`) REFERENCES `bullets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `bullet_variants` (
	`id` text PRIMARY KEY NOT NULL,
	`bullet_id` text NOT NULL,
	`text` text NOT NULL,
	`embedding` text,
	`is_primary` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`bullet_id`) REFERENCES `bullets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `bullet_variants_bullet_idx` ON `bullet_variants` (`bullet_id`);--> statement-breakpoint
CREATE TABLE `bullets` (
	`id` text PRIMARY KEY NOT NULL,
	`experience_id` text NOT NULL,
	`metric` text,
	`approved` integer DEFAULT true NOT NULL,
	`ord` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`experience_id`) REFERENCES `experiences`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `bullets_experience_idx` ON `bullets` (`experience_id`);--> statement-breakpoint
CREATE TABLE `education` (
	`id` text PRIMARY KEY NOT NULL,
	`degree` text NOT NULL,
	`university` text NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`start` text DEFAULT '' NOT NULL,
	`end` text DEFAULT '' NOT NULL,
	`url` text DEFAULT '' NOT NULL,
	`description` text DEFAULT '[]' NOT NULL,
	`ord` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `experiences` (
	`id` text PRIMARY KEY NOT NULL,
	`company` text NOT NULL,
	`title` text NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`start` text DEFAULT '' NOT NULL,
	`end` text DEFAULT '' NOT NULL,
	`url` text DEFAULT '' NOT NULL,
	`kind` text DEFAULT 'work' NOT NULL,
	`ord` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `flavor_bullets` (
	`flavor_id` text NOT NULL,
	`experience_id` text NOT NULL,
	`bullet_id` text NOT NULL,
	`ord` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`flavor_id`, `bullet_id`),
	FOREIGN KEY (`flavor_id`) REFERENCES `flavors`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`experience_id`) REFERENCES `experiences`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`bullet_id`) REFERENCES `bullets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `flavors` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`page_budget` integer DEFAULT 2 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `job_tags` (
	`job_id` text NOT NULL,
	`tag_id` text NOT NULL,
	`weight` real DEFAULT 1 NOT NULL,
	PRIMARY KEY(`job_id`, `tag_id`),
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`company` text NOT NULL,
	`location` text,
	`source` text DEFAULT '' NOT NULL,
	`url` text DEFAULT '' NOT NULL,
	`date_posted` text,
	`end_date` text,
	`description` text,
	`recruiter_name` text,
	`recruiter_email` text,
	`recruiter_phone` text,
	`status` text DEFAULT 'new' NOT NULL,
	`fit_score` real,
	`captured_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`last_seen_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `learned_answers` (
	`label` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `resumes` (
	`id` text PRIMARY KEY NOT NULL,
	`flavor_id` text,
	`resume_data` text NOT NULL,
	`pdf_hash` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`flavor_id`) REFERENCES `flavors`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `skill_tags` (
	`skill_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`skill_id`, `tag_id`),
	FOREIGN KEY (`skill_id`) REFERENCES `skills`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `skills` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`category` text DEFAULT '' NOT NULL,
	`ord` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `summary_snippets` (
	`id` text PRIMARY KEY NOT NULL,
	`text` text NOT NULL,
	`ord` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tag_edges` (
	`parent_tag_id` text NOT NULL,
	`child_tag_id` text NOT NULL,
	`kind` text DEFAULT 'is_a' NOT NULL,
	PRIMARY KEY(`parent_tag_id`, `child_tag_id`),
	FOREIGN KEY (`parent_tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`child_tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`category` text DEFAULT 'tech' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_unique` ON `tags` (`name`);