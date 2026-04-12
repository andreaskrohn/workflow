CREATE TABLE `tags` (
  `id`         text PRIMARY KEY NOT NULL,
  `name`       text NOT NULL UNIQUE,
  `created_at` integer NOT NULL
);
--> statement-breakpoint

CREATE TABLE `task_tags` (
  `id`         text PRIMARY KEY NOT NULL,
  `task_id`    text NOT NULL REFERENCES `tasks`(`id`),
  `tag_id`     text NOT NULL REFERENCES `tags`(`id`),
  `created_at` integer NOT NULL,
  `archived_at` integer
);
--> statement-breakpoint

-- Partial unique index: only one active link per (task, tag) pair.
-- Archived duplicates are allowed so re-adding a removed tag is possible.
CREATE UNIQUE INDEX `task_tags_unique_active`
  ON `task_tags`(`task_id`, `tag_id`)
  WHERE `archived_at` IS NULL;
--> statement-breakpoint

INSERT INTO `schema_version`(`version`, `applied_at`) VALUES (11, unixepoch());
