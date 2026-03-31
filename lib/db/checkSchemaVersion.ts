/**
 * Standalone schema version check — intentionally imports NO pino dependency.
 *
 * Why: pino's pino-roll transport spawns a worker thread.  Calling process.exit(1)
 * while that worker is still initialising triggers pino's ThreadStream.flushSync(),
 * which blocks for 10 s then throws.  The throw propagates back into process.exit(),
 * preventing process.reallyExit() from running.  If that throw is caught by any
 * surrounding try-catch, a second process.exit(1) call is a no-op because
 * process._exiting is already true — so the server starts normally.
 *
 * This module has no pino import, so process.exit(1) fires cleanly.  It must be
 * imported (or its check invoked) before any module that imports lib/logger.ts.
 */
import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { EXPECTED_SCHEMA_VERSION } from './schemaVersion'

const DEFAULT_DB_PATH =
  process.env['DATABASE_URL'] ??
  path.join(os.homedir(), 'Documents', 'workflow-data', 'workflow.db')

const LOG_PATH = path.join(process.cwd(), 'logs', 'app.log')

function writeFatal(msg: string, extra?: Record<string, unknown>): void {
  // Emit a pino-compatible NDJSON line so it lands in the log file alongside
  // normal application logs.
  const entry =
    JSON.stringify({ level: 60, time: Date.now(), pid: process.pid, msg, ...extra }) + '\n'

  // Write to log file (best effort — don't let a log failure hide the real error).
  try {
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true })
    fs.appendFileSync(LOG_PATH, entry)
  } catch {
    // intentionally silent
  }

  // Write to stderr synchronously so it is always visible in the terminal.
  process.stderr.write(entry)
}

/**
 * Read the highest schema_version from the database and compare it to
 * EXPECTED_SCHEMA_VERSION.  If they differ — or if the DB cannot be opened —
 * log a fatal error and exit immediately.
 *
 * Both parameters have production defaults; pass explicit values in tests.
 */
export function checkSchemaVersion(
  dbPath: string = DEFAULT_DB_PATH,
  expected: number = EXPECTED_SCHEMA_VERSION,
): void {
  try {
    const sqlite = new Database(dbPath, { readonly: true })

    const row = sqlite
      .prepare('SELECT MAX(version) AS version FROM schema_version')
      .get() as { version: number | null }

    sqlite.close()

    const actual = row?.version ?? 0

    if (actual !== expected) {
      writeFatal('Schema mismatch. Run: npm run db:migrate', { expected, actual })
      process.exit(1)
    }
  } catch (err: any) {
    writeFatal('Schema mismatch. Run: npm run db:migrate', { error: err?.message })
    process.exit(1)
  }
}
