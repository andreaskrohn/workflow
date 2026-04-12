import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Tag {
  id: string
  name: string
  created_at: number
}

// ── Functions ─────────────────────────────────────────────────────────────────

/**
 * Returns all tags ordered alphabetically by name.
 */
export function listTags(db: Database.Database): Tag[] {
  return db.prepare('SELECT * FROM tags ORDER BY name').all() as Tag[]
}

/**
 * Creates a new tag with a generated UUID.
 * Throws if the name is already taken (UNIQUE constraint).
 */
export function createTag(db: Database.Database, name: string): Tag {
  const id = randomUUID()
  const now = Math.floor(Date.now() / 1000)
  db.prepare('INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?)').run(id, name, now)
  return db.prepare('SELECT * FROM tags WHERE id = ?').get(id) as Tag
}

/**
 * Deletes a tag and soft-deletes all active task_tag links for it.
 * Returns `true` if the tag was found and deleted, `false` if it did not exist.
 */
export function deleteTag(db: Database.Database, id: string): boolean {
  const now = Math.floor(Date.now() / 1000)
  return db.transaction((): boolean => {
    const tag = db.prepare('SELECT id FROM tags WHERE id = ?').get(id)
    if (!tag) return false

    // Soft-delete all active task_tags for this tag (per CLAUDE.md: no DELETE on junction tables).
    db.prepare(
      'UPDATE task_tags SET archived_at = ? WHERE tag_id = ? AND archived_at IS NULL',
    ).run(now, id)

    // Hard-delete the tag row itself (not a junction table).
    db.prepare('DELETE FROM tags WHERE id = ?').run(id)
    return true
  })()
}

/**
 * Creates an active link between a task and a tag.
 * Throws if an active link already exists (UNIQUE constraint on task_tags_unique_active).
 */
export function addTagToTask(
  db: Database.Database,
  taskId: string,
  tagId: string,
): void {
  const id = randomUUID()
  const now = Math.floor(Date.now() / 1000)
  db.prepare(
    'INSERT INTO task_tags (id, task_id, tag_id, created_at) VALUES (?, ?, ?, ?)',
  ).run(id, taskId, tagId, now)
}

/**
 * Soft-deletes the active link between a task and a tag.
 * No-op if no active link exists.
 */
export function removeTagFromTask(
  db: Database.Database,
  taskId: string,
  tagId: string,
): void {
  const now = Math.floor(Date.now() / 1000)
  db.prepare(
    'UPDATE task_tags SET archived_at = ? WHERE task_id = ? AND tag_id = ? AND archived_at IS NULL',
  ).run(now, taskId, tagId)
}

/**
 * Returns all active tags associated with a given task, ordered by name.
 */
export function getTagsForTask(db: Database.Database, taskId: string): Tag[] {
  return db
    .prepare(
      `SELECT tg.*
       FROM tags tg
       JOIN task_tags tt ON tg.id = tt.tag_id
       WHERE tt.task_id = ? AND tt.archived_at IS NULL
       ORDER BY tg.name`,
    )
    .all(taskId) as Tag[]
}
