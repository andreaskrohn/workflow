import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import os from 'os'

const DB_DIR = path.join(os.homedir(), 'Documents', 'workflow-data')
const DB_PATH = path.join(DB_DIR, 'workflow.db')
const MIGRATIONS_DIR = path.join(process.cwd(), 'drizzle')
const MIGRATIONS_TABLE = '__migrations'

function timestamp(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  )
}

function backup(): string {
  const dest = path.join(DB_DIR, `workflow-${timestamp()}.pre-migration.db`)
  fs.copyFileSync(DB_PATH, dest)
  return dest
}

function pruneBackups(): void {
  const backups = fs
    .readdirSync(DB_DIR)
    .filter((f) => f.endsWith('.pre-migration.db'))
    .map((f) => ({ name: f, mtime: fs.statSync(path.join(DB_DIR, f)).mtime }))
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime())

  const toDelete = backups.slice(5)
  for (const { name } of toDelete) {
    fs.unlinkSync(path.join(DB_DIR, name))
    console.log(`Deleted old backup: ${name}`)
  }
}

function main(): void {
  fs.mkdirSync(DB_DIR, { recursive: true })

  // (a) Backup before applying
  let backedUp = false
  if (fs.existsSync(DB_PATH)) {
    const dest = backup()
    console.log(`Backup: ${dest}`)
    backedUp = true
  }

  const db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = OFF') // allow DDL without FK checks during migration

  db.exec(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT    NOT NULL UNIQUE,
      applied_at INTEGER NOT NULL
    )
  `)

  const applied = new Set<string>(
    (db.prepare(`SELECT filename FROM ${MIGRATIONS_TABLE}`).all() as { filename: string }[]).map(
      (r) => r.filename,
    ),
  )

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  let count = 0

  for (const file of files) {
    if (applied.has(file)) continue

    console.log(`Applying: ${file}`)
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8')

    // Run the entire migration file inside a transaction for atomicity.
    // --> statement-breakpoint markers are valid SQL line comments and are ignored.
    const run = db.transaction(() => {
      db.exec(sql)
      db.prepare(`INSERT INTO ${MIGRATIONS_TABLE}(filename, applied_at) VALUES (?, ?)`).run(
        file,
        Date.now(),
      )
    })
    run()
    count++
  }

  db.close()

  if (count === 0) {
    console.log('No new migrations to apply.')
    if (backedUp) pruneBackups() // still prune even if nothing ran
    return
  }

  console.log(`Applied ${count} migration(s).`)

  // (b) Prune backups after applying
  pruneBackups()
}

main()
