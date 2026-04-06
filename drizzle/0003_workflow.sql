-- Single-row workflow settings table.
CREATE TABLE `workflow` (
  `id`         integer PRIMARY KEY CHECK (`id` = 1),
  `end_goal`   text,
  `updated_at` integer NOT NULL
);
INSERT OR IGNORE INTO `workflow` (`id`, `end_goal`, `updated_at`) VALUES (1, NULL, unixepoch());
--> statement-breakpoint

INSERT INTO `schema_version`(`version`, `applied_at`) VALUES (4, unixepoch());
