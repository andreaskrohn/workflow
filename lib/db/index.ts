import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import path from 'path'
import os from 'os'
import * as schema from './schema'
import { EXPECTED_SCHEMA_VERSION } from './schemaVersion'
import logger from '../logger'

const DB_PATH = path.join(os.homedir(), 'Documents', 'workflow-data', 'workflow.db')

function openDb() {
  let sqlite: InstanceType<typeof Database>

  try {
    sqlite = new Database(DB_PATH)
    sqlite.pragma('journal_mode = WAL')
    sqlite.pragma('foreign_keys = ON')

    const row = sqlite
      .prepare('SELECT MAX(version) AS version FROM schema_version')
      .get() as { version: number | null }

    const actual = row?.version ?? 0

    if (actual !== EXPECTED_SCHEMA_VERSION) {
      logger.fatal(
        { expected: EXPECTED_SCHEMA_VERSION, actual },
        'Schema mismatch. Run: npm run db:migrate',
      )
      process.exit(1)
    }
  } catch (err: any) {
    if (err?.code === 'SQLITE_CANTOPEN' || err?.message?.includes('schema_version')) {
      logger.fatal('Schema mismatch. Run: npm run db:migrate')
    } else {
      logger.fatal({ err }, 'Schema mismatch. Run: npm run db:migrate')
    }
    process.exit(1)
  }

  return drizzle(sqlite!, { schema })
}

export const db = openDb()
