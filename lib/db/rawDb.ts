import Database from 'better-sqlite3'
import path from 'path'
import os from 'os'

const DB_PATH =
  process.env['DATABASE_URL'] ??
  path.join(os.homedir(), 'Documents', 'workflow-data', 'workflow.db')

// Singleton: reuse the same connection across hot-reloads in Next.js dev mode.
declare global {
  // eslint-disable-next-line no-var
  var __rawDb: Database.Database | undefined
}

if (!global.__rawDb) {
  global.__rawDb = new Database(DB_PATH)
  global.__rawDb.pragma('journal_mode = WAL')
  global.__rawDb.pragma('foreign_keys = ON')
}

export const rawDb: Database.Database = global.__rawDb
