import Database from 'better-sqlite3'
import { resetDatabase } from '../../../../tests/setup'
import {
  listTags,
  createTag,
  deleteTag,
  addTagToTask,
  removeTagFromTask,
  getTagsForTask,
} from '../tagRepository'
import { createTask } from '../taskRepository'

// ── Helpers ───────────────────────────────────────────────────────────────────

function db(): Database.Database {
  const d = new Database(process.env['DATABASE_URL']!)
  d.pragma('busy_timeout = 5000')
  d.pragma('foreign_keys = ON')
  return d
}

beforeEach(() => {
  resetDatabase()
})

// ── listTags ──────────────────────────────────────────────────────────────────

it('listTags returns an empty array when no tags exist', () => {
  const d = db()
  expect(listTags(d)).toEqual([])
  d.close()
})

it('listTags returns all created tags ordered by name', () => {
  const d = db()
  createTag(d, 'zebra')
  createTag(d, 'alpha')
  createTag(d, 'middle')
  const tags = listTags(d)
  d.close()
  expect(tags.map((t) => t.name)).toEqual(['alpha', 'middle', 'zebra'])
})

// ── createTag ─────────────────────────────────────────────────────────────────

it('createTag returns a tag with id, name and created_at', () => {
  const d = db()
  const tag = createTag(d, 'urgent')
  d.close()
  expect(tag.id).toBeTruthy()
  expect(tag.name).toBe('urgent')
  expect(typeof tag.created_at).toBe('number')
})

it('createTag generates unique ids for each tag', () => {
  const d = db()
  const a = createTag(d, 'alpha')
  const b = createTag(d, 'beta')
  d.close()
  expect(a.id).not.toBe(b.id)
})

it('createTag throws when name is a duplicate', () => {
  const d = db()
  createTag(d, 'duplicate')
  expect(() => createTag(d, 'duplicate')).toThrow()
  d.close()
})

it('createTag is case-sensitive for uniqueness', () => {
  const d = db()
  createTag(d, 'Design')
  expect(() => createTag(d, 'design')).not.toThrow()
  d.close()
})

// ── deleteTag ─────────────────────────────────────────────────────────────────

it('deleteTag removes the tag from listTags', () => {
  const d = db()
  const tag = createTag(d, 'to-delete')
  deleteTag(d, tag.id)
  expect(listTags(d).map((t) => t.id)).not.toContain(tag.id)
  d.close()
})

it('deleteTag returns true when the tag existed', () => {
  const d = db()
  const tag = createTag(d, 'exists')
  expect(deleteTag(d, tag.id)).toBe(true)
  d.close()
})

it('deleteTag returns false when the tag does not exist', () => {
  const d = db()
  expect(deleteTag(d, 'nonexistent-id')).toBe(false)
  d.close()
})

it('deleteTag soft-deletes active task_tags before removing the tag', () => {
  const d = db()
  d.pragma('foreign_keys = OFF') // task needs a workflow_id normally; skip FK for this test
  const task = createTask(d, { title: 'Tagged task', workflow_id: null })
  const tag = createTag(d, 'linked')
  addTagToTask(d, task.id, tag.id)

  // Should not throw even though task_tags exist
  expect(() => deleteTag(d, tag.id)).not.toThrow()
  // Tag is gone
  expect(listTags(d).map((t) => t.id)).not.toContain(tag.id)
  // Task has no active tags
  expect(getTagsForTask(d, task.id)).toHaveLength(0)
  d.close()
})

// ── addTagToTask ──────────────────────────────────────────────────────────────

it('addTagToTask links a tag to a task', () => {
  const d = db()
  d.pragma('foreign_keys = OFF')
  const task = createTask(d, { title: 'My task', workflow_id: null })
  const tag = createTag(d, 'important')
  addTagToTask(d, task.id, tag.id)
  const tags = getTagsForTask(d, task.id)
  d.close()
  expect(tags.map((t) => t.id)).toContain(tag.id)
})

it('addTagToTask is idempotent (re-adding after removal re-creates the link)', () => {
  const d = db()
  d.pragma('foreign_keys = OFF')
  const task = createTask(d, { title: 'My task', workflow_id: null })
  const tag = createTag(d, 'idempotent')
  addTagToTask(d, task.id, tag.id)
  removeTagFromTask(d, task.id, tag.id)
  // Should not throw
  expect(() => addTagToTask(d, task.id, tag.id)).not.toThrow()
  expect(getTagsForTask(d, task.id)).toHaveLength(1)
  d.close()
})

it('adding the same active tag to the same task twice throws', () => {
  const d = db()
  d.pragma('foreign_keys = OFF')
  const task = createTask(d, { title: 'My task', workflow_id: null })
  const tag = createTag(d, 'once-only')
  addTagToTask(d, task.id, tag.id)
  expect(() => addTagToTask(d, task.id, tag.id)).toThrow()
  d.close()
})

// ── removeTagFromTask ─────────────────────────────────────────────────────────

it('removeTagFromTask soft-deletes the link (sets archived_at)', () => {
  const d = db()
  d.pragma('foreign_keys = OFF')
  const task = createTask(d, { title: 'My task', workflow_id: null })
  const tag = createTag(d, 'removable')
  addTagToTask(d, task.id, tag.id)
  removeTagFromTask(d, task.id, tag.id)
  expect(getTagsForTask(d, task.id)).toHaveLength(0)
  d.close()
})

it('removeTagFromTask is a no-op when the link does not exist', () => {
  const d = db()
  d.pragma('foreign_keys = OFF')
  const task = createTask(d, { title: 'My task', workflow_id: null })
  const tag = createTag(d, 'ghost')
  expect(() => removeTagFromTask(d, task.id, tag.id)).not.toThrow()
  d.close()
})

// ── getTagsForTask ────────────────────────────────────────────────────────────

it('getTagsForTask returns an empty array when the task has no tags', () => {
  const d = db()
  d.pragma('foreign_keys = OFF')
  const task = createTask(d, { title: 'No tags', workflow_id: null })
  expect(getTagsForTask(d, task.id)).toEqual([])
  d.close()
})

it('getTagsForTask returns multiple tags for a task', () => {
  const d = db()
  d.pragma('foreign_keys = OFF')
  const task = createTask(d, { title: 'Multi-tagged', workflow_id: null })
  const a = createTag(d, 'a')
  const b = createTag(d, 'b')
  addTagToTask(d, task.id, a.id)
  addTagToTask(d, task.id, b.id)
  const tags = getTagsForTask(d, task.id)
  d.close()
  expect(tags.map((t) => t.id).sort()).toEqual([a.id, b.id].sort())
})

it('getTagsForTask excludes archived (removed) task_tag links', () => {
  const d = db()
  d.pragma('foreign_keys = OFF')
  const task = createTask(d, { title: 'Partial tags', workflow_id: null })
  const a = createTag(d, 'active')
  const b = createTag(d, 'removed')
  addTagToTask(d, task.id, a.id)
  addTagToTask(d, task.id, b.id)
  removeTagFromTask(d, task.id, b.id)
  const tags = getTagsForTask(d, task.id)
  d.close()
  expect(tags.map((t) => t.id)).toContain(a.id)
  expect(tags.map((t) => t.id)).not.toContain(b.id)
})

it('getTagsForTask does not return tags from other tasks', () => {
  const d = db()
  d.pragma('foreign_keys = OFF')
  const t1 = createTask(d, { title: 'Task 1', workflow_id: null })
  const t2 = createTask(d, { title: 'Task 2', workflow_id: null })
  const tag = createTag(d, 'isolated')
  addTagToTask(d, t1.id, tag.id)
  expect(getTagsForTask(d, t2.id)).toHaveLength(0)
  d.close()
})
