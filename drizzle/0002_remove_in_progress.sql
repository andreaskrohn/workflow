-- Convert any existing in_progress tasks to todo.
-- SQLite has no CHECK constraint on this column so no DDL change is needed;
-- only the TypeScript layer enforces the enum going forward.
UPDATE `tasks` SET `status` = 'todo' WHERE `status` = 'in_progress';
--> statement-breakpoint

INSERT INTO `schema_version`(`version`, `applied_at`) VALUES (3, unixepoch());
