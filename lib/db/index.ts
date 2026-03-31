import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import path from 'path'
import os from 'os'
import * as schema from './schema'

const DB_PATH = path.join(os.homedir(), 'Documents', 'workflow-data', 'workflow.db')

function openDb() {
  const sqlite = new Database(DB_PATH)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  return drizzle(sqlite, { schema })
}

export const db = openDb()
