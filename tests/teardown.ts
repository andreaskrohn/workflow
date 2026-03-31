import fs from 'fs'
import path from 'path'

const TEST_DB_PATH = path.join(process.cwd(), 'workflow-test.db')

export default async function globalTeardown() {
  const dbPath = process.env['DATABASE_URL'] ?? TEST_DB_PATH
  for (const suffix of ['', '-shm', '-wal']) {
    const f = dbPath + suffix
    if (fs.existsSync(f)) fs.unlinkSync(f)
  }
}
