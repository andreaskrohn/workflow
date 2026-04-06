import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'

export const spaces = sqliteTable('spaces', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  created_at: integer('created_at').notNull(),
  updated_at: integer('updated_at').notNull(),
})

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  space_id: text('space_id')
    .notNull()
    .references(() => spaces.id),
  name: text('name').notNull(),
  created_at: integer('created_at').notNull(),
  updated_at: integer('updated_at').notNull(),
})

export const workflows = sqliteTable('workflows', {
  id: text('id').primaryKey(),
  project_id: text('project_id')
    .notNull()
    .references(() => projects.id),
  name: text('name').notNull(),
  end_goal: text('end_goal'),
  due_date: integer('due_date'),
  sort_order: integer('sort_order').notNull().default(0),
  archived_at: integer('archived_at'),
  eg_position_x: real('eg_position_x'),
  eg_position_y: real('eg_position_y'),
  created_at: integer('created_at').notNull(),
  updated_at: integer('updated_at').notNull(),
})

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  workflow_id: text('workflow_id').references(() => workflows.id),
  title: text('title').notNull(),
  description: text('description'),
  notes: text('notes'),
  status: text('status', { enum: ['todo', 'done', 'blocked'] })
    .notNull()
    .default('todo'),
  priority: integer('priority').notNull().default(3), // 1 (lowest) – 5 (highest)
  due_date: integer('due_date'), // unix timestamp
  defer_date: integer('defer_date'), // unix timestamp
  created_at: integer('created_at').notNull(),
  updated_at: integer('updated_at').notNull(),
  archived_at: integer('archived_at'), // null = active
  position_x: real('position_x'),
  position_y: real('position_y'),
  end_goal: text('end_goal'), // deprecated — end_goal lives on workflows now
})

export const taskDependencies = sqliteTable('task_dependencies', {
  id: text('id').primaryKey(),
  task_id: text('task_id')
    .notNull()
    .references(() => tasks.id),
  depends_on_task_id: text('depends_on_task_id')
    .notNull()
    .references(() => tasks.id),
  created_at: integer('created_at').notNull(),
  archived_at: integer('archived_at'), // null = active; partial unique index enforced in SQL
})

export const schemaVersion = sqliteTable('schema_version', {
  version: integer('version').primaryKey(),
  applied_at: integer('applied_at').notNull(),
})

/** Renamed from `workflow` — holds app-wide settings (e.g. last_backup_at). */
export const appSettings = sqliteTable('app_settings', {
  id: integer('id').primaryKey(),
  end_goal: text('end_goal'), // legacy column, no longer used
  last_backup_at: integer('last_backup_at'),
  updated_at: integer('updated_at').notNull(),
})
