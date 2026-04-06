-- Rename singleton settings table so it doesn't collide with the new workflows table.
ALTER TABLE `workflow` RENAME TO `app_settings`;
--> statement-breakpoint

-- ── New hierarchy tables ──────────────────────────────────────────────────────

CREATE TABLE `spaces` (
  `id`         text PRIMARY KEY,
  `name`       text NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

CREATE TABLE `projects` (
  `id`         text PRIMARY KEY,
  `space_id`   text NOT NULL REFERENCES `spaces`(`id`),
  `name`       text NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

CREATE TABLE `workflows` (
  `id`         text PRIMARY KEY,
  `project_id` text NOT NULL REFERENCES `projects`(`id`),
  `name`       text NOT NULL,
  `end_goal`   text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint

-- Link tasks to a workflow (nullable for backwards compatibility with existing rows).
ALTER TABLE `tasks` ADD COLUMN `workflow_id` text REFERENCES `workflows`(`id`);
--> statement-breakpoint

-- ── Default hierarchy — migrate existing data ────────────────────────────────

INSERT INTO `spaces` VALUES (
  '00000000-0000-0000-0000-000000000001',
  'My Space',
  unixepoch(), unixepoch()
);

INSERT INTO `projects` VALUES (
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  'My Project',
  unixepoch(), unixepoch()
);

-- Carry the end_goal that was on app_settings into the first real workflow.
INSERT INTO `workflows` (`id`, `project_id`, `name`, `end_goal`, `created_at`, `updated_at`)
SELECT
  '00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000002',
  'My Workflow',
  `end_goal`,
  unixepoch(),
  unixepoch()
FROM `app_settings`
WHERE `id` = 1;

-- Fallback: if app_settings had no row, still create the default workflow.
INSERT OR IGNORE INTO `workflows` (`id`, `project_id`, `name`, `end_goal`, `created_at`, `updated_at`)
VALUES (
  '00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000002',
  'My Workflow',
  NULL,
  unixepoch(), unixepoch()
);

-- Assign all existing tasks to the default workflow.
UPDATE `tasks` SET `workflow_id` = '00000000-0000-0000-0000-000000000003'
WHERE `workflow_id` IS NULL;
--> statement-breakpoint

INSERT INTO `schema_version`(`version`, `applied_at`) VALUES (6, unixepoch());
