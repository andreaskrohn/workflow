import fs from 'fs'
import path from 'path'
import os from 'os'

const DB_DIR = path.join(os.homedir(), 'Documents', 'workflow-data')
const DB_PATH = path.join(DB_DIR, 'workflow.db')

function main(): void {
  if (!fs.existsSync(DB_DIR)) {
    console.error(`Database directory not found: ${DB_DIR}`)
    process.exit(1)
  }

  const backups = fs
    .readdirSync(DB_DIR)
    .filter((f) => f.endsWith('.pre-migration.db'))
    .map((f) => ({ name: f, mtime: fs.statSync(path.join(DB_DIR, f)).mtime }))
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime())

  if (backups.length === 0) {
    console.error('No pre-migration backup found to roll back to.')
    process.exit(1)
  }

  const { name } = backups[0]
  const src = path.join(DB_DIR, name)

  fs.copyFileSync(src, DB_PATH)
  console.log(`Rolled back to: ${name}`)
}

main()
