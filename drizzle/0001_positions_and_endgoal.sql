ALTER TABLE `tasks` ADD COLUMN `position_x` real;
--> statement-breakpoint
ALTER TABLE `tasks` ADD COLUMN `position_y` real;
--> statement-breakpoint
ALTER TABLE `tasks` ADD COLUMN `end_goal` text;
--> statement-breakpoint

INSERT INTO `schema_version`(`version`, `applied_at`) VALUES (2, unixepoch());
