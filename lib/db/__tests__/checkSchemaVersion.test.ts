import Database from 'better-sqlite3'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { checkSchemaVersion } from '../checkSchemaVersion'

// ── helpers ──────────────────────────────────────────────────────────────────

function makeDb(dir: string, version: number | null) {
  const dbPath = path.join(dir, 'test.db')
  const db = new Database(dbPath)
  db.exec(`
    CREATE TABLE schema_version (
      version    INTEGER PRIMARY KEY NOT NULL,
      applied_at INTEGER NOT NULL
    )
  `)
  if (version !== null) {
    db.prepare('INSERT INTO schema_version VALUES (?, ?)').run(version, Date.now())
  }
  db.close()
  return dbPath
}

// ── setup ────────────────────────────────────────────────────────────────────

let tmpDir: string
let exitSpy: jest.SpyInstance
let stderrSpy: jest.SpyInstance

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-schema-test-'))

  // Prevent process.exit from actually terminating the test runner.
  exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => {}) as (code?: number) => never)

  // Suppress stderr noise in test output.
  stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true)
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
  jest.restoreAllMocks()
})

// ── tests ─────────────────────────────────────────────────────────────────────

describe('checkSchemaVersion', () => {
  it('does not exit when DB version matches expected', () => {
    const dbPath = makeDb(tmpDir, 1)
    checkSchemaVersion(dbPath, 1)
    expect(exitSpy).not.toHaveBeenCalled()
  })

  it('calls process.exit(1) when DB version is lower than expected', () => {
    const dbPath = makeDb(tmpDir, 1)
    checkSchemaVersion(dbPath, 99)
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it('calls process.exit(1) when DB version is higher than expected', () => {
    const dbPath = makeDb(tmpDir, 5)
    checkSchemaVersion(dbPath, 1)
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it('writes fatal message to stderr on version mismatch', () => {
    const dbPath = makeDb(tmpDir, 1)
    checkSchemaVersion(dbPath, 99)
    const written = stderrSpy.mock.calls.map((c) => String(c[0])).join('')
    expect(written).toContain('Schema mismatch. Run: npm run db:migrate')
  })

  it('calls process.exit(1) when the database file does not exist', () => {
    checkSchemaVersion(path.join(tmpDir, 'nonexistent.db'), 1)
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it('calls process.exit(1) when schema_version table is missing', () => {
    const dbPath = path.join(tmpDir, 'no-table.db')
    const db = new Database(dbPath)
    db.exec('CREATE TABLE tasks (id TEXT PRIMARY KEY)')
    db.close()
    checkSchemaVersion(dbPath, 1)
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it('writes fatal message to stderr on any DB error', () => {
    checkSchemaVersion(path.join(tmpDir, 'nonexistent.db'), 1)
    const written = stderrSpy.mock.calls.map((c) => String(c[0])).join('')
    expect(written).toContain('Schema mismatch. Run: npm run db:migrate')
  })
})
