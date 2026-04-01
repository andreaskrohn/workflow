import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  notes: text('notes'),
  status: text('status', { enum: ['todo', 'in_progress', 'done', 'blocked'] })
    .notNull()
    .default('todo'),
  priority: integer('priority').notNull().default(3), // 1 (lowest) – 5 (highest)
  due_date: integer('due_date'), // unix timestamp
  created_at: integer('created_at').notNull(),
  updated_at: integer('updated_at').notNull(),
  archived_at: integer('archived_at'), // null = active
  position_x: real('position_x'),
  position_y: real('position_y'),
  end_goal: text('end_goal'),
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
