import { NextRequest } from 'next/server'
import { GET } from '../route'
import { resetDatabase } from '../../../../../tests/setup'
import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import { createTask, updateTask } from '@/lib/db/repositories/taskRepository'
import { createTag, addTagToTask, removeTagFromTask } from '@/lib/db/repositories/tagRepository'
import { createWorkflow } from '@/lib/db/repositories/workflowRepository'
import { createDependency } from '@/lib/db/repositories/taskDependencyRepository'

// ── Test-DB project setup ─────────────────────────────────────────────────────

let PROJECT_ID: string

beforeAll(() => {
  const spaceId = randomUUID()
  PROJECT_ID = randomUUID()
  const d = new Database(process.env['DATABASE_URL']!)
  d.pragma('busy_timeout = 5000')
  d.pragma('foreign_keys = OFF')
  const now = Math.floor(Date.now() / 1000)
  d.prepare('INSERT INTO spaces (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(spaceId, 'S', now, now)
  d.prepare('INSERT INTO projects (id, space_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(PROJECT_ID, spaceId, 'P', now, now)
  d.pragma('foreign_keys = ON')
  d.close()
})

// ── Helpers ───────────────────────────────────────────────────────────────────

let rlSeq = 0
const freshIp = () => `10.9.${Math.floor(++rlSeq / 256)}.${rlSeq % 256}`

function makeGet(tags: string[], ip = '1.1.1.1'): NextRequest {
  const qs = tags.length ? `?tags=${tags.join(',')}` : ''
  return new NextRequest(`http://localhost/api/tasks/by-tag${qs}`, {
    method: 'GET',
    headers: { 'x-forwarded-for': ip },
  })
}

function db(): Database.Database {
  const d = new Database(process.env['DATABASE_URL']!)
  d.pragma('busy_timeout = 5000')
  d.pragma('foreign_keys = OFF')
  return d
}

function resetAll() {
  resetDatabase()
  const d = db()
  d.prepare('DELETE FROM workflows WHERE project_id = ?').run(PROJECT_ID)
  d.close()
}

beforeEach(resetAll)

// ── No tags param ─────────────────────────────────────────────────────────────

it('returns 200 with an empty array when no tags param is given', async () => {
  const res = await GET(makeGet([]))
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual([])
})

it('returns an empty array when the tag exists but has no tasks', async () => {
  const d = db()
  const tag = createTag(d, 'empty-tag')
  d.close()

  const res = await GET(makeGet([tag.id]))
  expect(await res.json()).toEqual([])
})

// ── Basic inclusion / exclusion ───────────────────────────────────────────────

it('returns a task that carries the specified tag', async () => {
  const d = db()
  const tag = createTag(d, 'urgent')
  const task = createTask(d, { title: 'Fix crash', workflow_id: null })
  addTagToTask(d, task.id, tag.id)
  d.close()

  const res = await GET(makeGet([tag.id]))
  const body = await res.json() as { title: string }[]
  expect(body).toHaveLength(1)
  expect(body[0]!.title).toBe('Fix crash')
})

it('does not return a task that lacks the specified tag', async () => {
  const d = db()
  const tag = createTag(d, 'urgent')
  createTask(d, { title: 'Untagged task', workflow_id: null })
  d.close()

  const res = await GET(makeGet([tag.id]))
  expect(await res.json()).toEqual([])
})

it('excludes archived tasks even when they carry the tag', async () => {
  const d = db()
  const tag = createTag(d, 'archived-tag')
  const task = createTask(d, { title: 'Archived', workflow_id: null })
  addTagToTask(d, task.id, tag.id)
  d.prepare('UPDATE tasks SET archived_at = ? WHERE id = ?').run(
    Math.floor(Date.now() / 1000),
    task.id,
  )
  d.close()

  const res = await GET(makeGet([tag.id]))
  expect(await res.json()).toEqual([])
})

it('excludes done tasks', async () => {
  const d = db()
  const tag = createTag(d, 'done-tag')
  const task = createTask(d, { title: 'Done', workflow_id: null })
  updateTask(d, task.id, { status: 'done' })
  addTagToTask(d, task.id, tag.id)
  d.close()

  const res = await GET(makeGet([tag.id]))
  expect(await res.json()).toEqual([])
})

it('excludes blocked tasks', async () => {
  const d = db()
  const tag = createTag(d, 'blocked-tag')
  const task = createTask(d, { title: 'Blocked', workflow_id: null })
  updateTask(d, task.id, { status: 'blocked' })
  addTagToTask(d, task.id, tag.id)
  d.close()

  const res = await GET(makeGet([tag.id]))
  expect(await res.json()).toEqual([])
})

it('excludes tasks whose tag association has been soft-deleted', async () => {
  const d = db()
  const tag = createTag(d, 'removed-tag')
  const task = createTask(d, { title: 'Was tagged', workflow_id: null })
  addTagToTask(d, task.id, tag.id)
  removeTagFromTask(d, task.id, tag.id)   // soft-delete the link
  d.close()

  const res = await GET(makeGet([tag.id]))
  expect(await res.json()).toEqual([])
})

// ── OR logic ──────────────────────────────────────────────────────────────────

it('OR logic: returns tasks with tag A OR tag B', async () => {
  const d = db()
  const tagA = createTag(d, 'tag-a')
  const tagB = createTag(d, 'tag-b')
  const taskA = createTask(d, { title: 'Only A', workflow_id: null })
  const taskB = createTask(d, { title: 'Only B', workflow_id: null })
  addTagToTask(d, taskA.id, tagA.id)
  addTagToTask(d, taskB.id, tagB.id)
  d.close()

  const res = await GET(makeGet([tagA.id, tagB.id]))
  const body = await res.json() as { title: string }[]
  const titles = body.map((t) => t.title)
  expect(titles).toContain('Only A')
  expect(titles).toContain('Only B')
})

it('does not duplicate a task that has both tag A and tag B', async () => {
  const d = db()
  const tagA = createTag(d, 'dup-a')
  const tagB = createTag(d, 'dup-b')
  const task = createTask(d, { title: 'Has both', workflow_id: null })
  addTagToTask(d, task.id, tagA.id)
  addTagToTask(d, task.id, tagB.id)
  d.close()

  const res = await GET(makeGet([tagA.id, tagB.id]))
  const body = await res.json() as { title: string }[]
  expect(body.filter((t) => t.title === 'Has both')).toHaveLength(1)
})

// ── Enablement (workflow dependency rules) ────────────────────────────────────

it('includes inbox tasks (workflow_id IS NULL) with the tag', async () => {
  const d = db()
  const tag = createTag(d, 'inbox-tag')
  const task = createTask(d, { title: 'Inbox task', workflow_id: null })
  addTagToTask(d, task.id, tag.id)
  d.close()

  const res = await GET(makeGet([tag.id]))
  const body = await res.json() as { title: string }[]
  expect(body.some((t) => t.title === 'Inbox task')).toBe(true)
})

it('excludes a workflow task whose prerequisite is not yet done', async () => {
  const d = db()
  const wf = createWorkflow(d, { project_id: PROJECT_ID, name: 'Wf' })
  const tag = createTag(d, 'dep-tag')
  const prereq = createTask(d, { title: 'Prereq', workflow_id: wf.id })
  const blocked = createTask(d, { title: 'Waiting', workflow_id: wf.id })
  createDependency(d, { task_id: blocked.id, depends_on_task_id: prereq.id })
  addTagToTask(d, blocked.id, tag.id)
  d.close()

  const res = await GET(makeGet([tag.id]))
  const body = await res.json() as { title: string }[]
  expect(body.every((t) => t.title !== 'Waiting')).toBe(true)
})

it('includes a workflow task once its prerequisite is done', async () => {
  const d = db()
  const wf = createWorkflow(d, { project_id: PROJECT_ID, name: 'Wf2' })
  const tag = createTag(d, 'unblocked-tag')
  const prereq = createTask(d, { title: 'Prereq', workflow_id: wf.id })
  const ready = createTask(d, { title: 'Now ready', workflow_id: wf.id })
  createDependency(d, { task_id: ready.id, depends_on_task_id: prereq.id })
  updateTask(d, prereq.id, { status: 'done' })
  addTagToTask(d, ready.id, tag.id)
  d.close()

  const res = await GET(makeGet([tag.id]))
  const body = await res.json() as { title: string }[]
  expect(body.some((t) => t.title === 'Now ready')).toBe(true)
})

// ── Sorting ───────────────────────────────────────────────────────────────────

it('sorts by due_date ASC with nulls last', async () => {
  const d = db()
  const tag = createTag(d, 'sort-tag')

  const later = createTask(d, { title: 'Later', workflow_id: null, due_date: 2_000_000 })
  const noDate = createTask(d, { title: 'No date', workflow_id: null })
  const sooner = createTask(d, { title: 'Sooner', workflow_id: null, due_date: 1_000_000 })

  addTagToTask(d, later.id, tag.id)
  addTagToTask(d, noDate.id, tag.id)
  addTagToTask(d, sooner.id, tag.id)
  d.close()

  const res = await GET(makeGet([tag.id]))
  const body = await res.json() as { title: string }[]
  expect(body.map((t) => t.title)).toEqual(['Sooner', 'Later', 'No date'])
})

it('nulls sort after all dated tasks', async () => {
  const d = db()
  const tag = createTag(d, 'null-sort-tag')

  const withDate = createTask(d, { title: 'Has date', workflow_id: null, due_date: 999 })
  const withNull = createTask(d, { title: 'No date', workflow_id: null })

  addTagToTask(d, withDate.id, tag.id)
  addTagToTask(d, withNull.id, tag.id)
  d.close()

  const res = await GET(makeGet([tag.id]))
  const body = await res.json() as { title: string }[]
  expect(body[0]!.title).toBe('Has date')
  expect(body[1]!.title).toBe('No date')
})

// ── Rate limiting ─────────────────────────────────────────────────────────────

it('returns 429 after exceeding the rate limit', async () => {
  const d = db()
  const tag = createTag(d, 'rl-tag')
  d.close()

  const ip = freshIp()
  for (let i = 0; i < 100; i++) {
    await GET(makeGet([tag.id], ip))
  }
  const res = await GET(makeGet([tag.id], ip))
  expect(res.status).toBe(429)
  expect(res.headers.get('Retry-After')).toBeTruthy()
})
