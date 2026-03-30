CREATE TABLE `tasks` (
  `id` text PRIMARY KEY NOT NULL,
  `title` text NOT NULL,
  `description` text,
  `notes` text,
  `status` text DEFAULT 'todo' NOT NULL,
  `priority` integer DEFAULT 3 NOT NULL,
  `due_date` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  `archived_at` integer
);
--> statement-breakpoint
CREATE TABLE `task_dependencies` (
  `id` text PRIMARY KEY NOT NULL,
  `task_id` text NOT NULL,
  `depends_on_task_id` text NOT NULL,
  `created_at` integer NOT NULL,
  `archived_at` integer,
  FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`),
  FOREIGN KEY (`depends_on_task_id`) REFERENCES `tasks`(`id`)
);
--> statement-breakpoint
CREATE TABLE `schema_version` (
  `version` integer PRIMARY KEY NOT NULL,
  `applied_at` integer NOT NULL
);
--> statement-breakpoint

-- Partial unique index: only one active (non-archived) edge per (task, dependency) pair.
-- Archived duplicates are allowed to support undo flows.
CREATE UNIQUE INDEX `task_deps_unique_active`
  ON `task_dependencies`(`task_id`, `depends_on_task_id`)
  WHERE `archived_at` IS NULL;
--> statement-breakpoint

-- FTS5 virtual table for full-text search across task content.
-- Regular (non-content) FTS5: stores its own index, kept in sync by triggers below.
CREATE VIRTUAL TABLE `tasks_fts` USING fts5(
  `title`,
  `description`,
  `notes`
);
--> statement-breakpoint

-- Trigger 1: keep FTS index in sync on INSERT.
CREATE TRIGGER `tasks_fts_insert`
AFTER INSERT ON `tasks`
BEGIN
  INSERT INTO `tasks_fts`(`rowid`, `title`, `description`, `notes`)
  VALUES (NEW.`rowid`, NEW.`title`, NEW.`description`, NEW.`notes`);
END;
--> statement-breakpoint

-- Trigger 2: keep FTS index in sync when searchable fields change.
CREATE TRIGGER `tasks_fts_update`
AFTER UPDATE OF `title`, `description`, `notes` ON `tasks`
BEGIN
  DELETE FROM `tasks_fts` WHERE `rowid` = OLD.`rowid`;
  INSERT INTO `tasks_fts`(`rowid`, `title`, `description`, `notes`)
  VALUES (NEW.`rowid`, NEW.`title`, NEW.`description`, NEW.`notes`);
END;
--> statement-breakpoint

-- Trigger 3: remove from FTS index when a task is archived.
-- Archived tasks are excluded from search results without needing a WHERE filter.
CREATE TRIGGER `tasks_fts_archive`
AFTER UPDATE OF `archived_at` ON `tasks`
WHEN NEW.`archived_at` IS NOT NULL
BEGIN
  DELETE FROM `tasks_fts` WHERE `rowid` = OLD.`rowid`;
END;
--> statement-breakpoint

-- Trigger 4: restore FTS entry when a task is un-archived (Undo archive).
CREATE TRIGGER `tasks_fts_unarchive`
AFTER UPDATE OF `archived_at` ON `tasks`
WHEN NEW.`archived_at` IS NULL
BEGIN
  INSERT INTO `tasks_fts`(`rowid`, `title`, `description`, `notes`)
  SELECT `rowid`, `title`, `description`, `notes`
  FROM `tasks`
  WHERE `id` = NEW.`id`;
END;
--> statement-breakpoint

INSERT INTO `schema_version`(`version`, `applied_at`) VALUES (1, unixepoch());
