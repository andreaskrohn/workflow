-- Track when the last successful backup completed.
ALTER TABLE `workflow` ADD COLUMN `last_backup_at` integer;
--> statement-breakpoint

INSERT INTO `schema_version`(`version`, `applied_at`) VALUES (5, unixepoch());
