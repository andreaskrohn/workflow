import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'

export interface Project {
  id: string
  space_id: string
  name: string
  created_at: number
  updated_at: number
}

export function listProjects(
  db: Database.Database,
  options: { spaceId?: string } = {},
): Project[] {
  if (options.spaceId) {
    return db
      .prepare('SELECT * FROM projects WHERE space_id = ? ORDER BY created_at ASC')
      .all(options.spaceId) as Project[]
  }
  return db
    .prepare('SELECT * FROM projects ORDER BY created_at ASC')
    .all() as Project[]
}

export function getProjectById(
  db: Database.Database,
  id: string,
): Project | undefined {
  return db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Project | undefined
}

export function createProject(
  db: Database.Database,
  input: { space_id: string; name: string },
): Project {
  const id = randomUUID()
  const now = Math.floor(Date.now() / 1000)
  db.prepare(`
    INSERT INTO projects (id, space_id, name, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, input.space_id, input.name, now, now)
  return getProjectById(db, id)!
}
