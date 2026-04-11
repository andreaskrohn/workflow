import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'

const TEST_DB_PATH = path.join(process.cwd(), 'workflow-test.db')
const MIGRATIONS_DIR = path.join(process.cwd(), 'drizzle')
const MIGRATIONS_TABLE = '__migrations'

export default async function globalSetup() {
  process.env['DATABASE_URL'] = TEST_DB_PATH
  process.env['LOG_LEVEL'] = 'warn'
  process.env['NODE_ENV'] = 'test'

  // Start fresh each run
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH)
  }

  const db = new Database(TEST_DB_PATH)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = OFF')

  db.exec(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      filename   TEXT    NOT NULL UNIQUE,
      applied_at INTEGER NOT NULL
    )
  `)

  const applied = new Set<string>(
    (
      db.prepare(`SELECT filename FROM ${MIGRATIONS_TABLE}`).all() as { filename: string }[]
    ).map((r) => r.filename),
  )

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  for (const file of files) {
    if (applied.has(file)) continue
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8')
    const run = db.transaction(() => {
      db.exec(sql)
      db
        .prepare(`INSERT INTO ${MIGRATIONS_TABLE}(filename, applied_at) VALUES (?, ?)`)
        .run(file, Date.now())
    })
    run()
  }

  db.pragma('foreign_keys = ON')
  db.close()
}

export function resetDatabase(): void {
  const db = new Database(process.env['DATABASE_URL'] ?? TEST_DB_PATH)
  db.pragma('busy_timeout = 5000')
  db.pragma('foreign_keys = OFF')
  db.exec('DELETE FROM task_dependencies')
  db.exec('DELETE FROM tasks')
  db.exec('DELETE FROM tasks_fts')
  db.pragma('foreign_keys = ON')
  db.close()
}
