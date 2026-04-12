import Database from 'better-sqlite3'
import fs from 'fs'

describe('test infrastructure', () => {
  it('DATABASE_URL points to the test database', () => {
    expect(process.env['DATABASE_URL']).toContain('workflow-test.db')
  })

  it('test database exists and has schema_version table', () => {
    const dbPath = process.env['DATABASE_URL']!
    expect(fs.existsSync(dbPath)).toBe(true)

    const db = new Database(dbPath, { readonly: true })
    const row = db
      .prepare('SELECT MAX(version) AS version FROM schema_version')
      .get() as { version: number | null }
    db.close()

    expect(row.version).toBe(11)
  })

  it('NODE_ENV is test', () => {
    expect(process.env['NODE_ENV']).toBe('test')
  })
})
