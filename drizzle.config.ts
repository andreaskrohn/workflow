import type { Config } from 'drizzle-kit'
import os from 'os'
import path from 'path'

export default {
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: path.join(os.homedir(), 'Documents', 'workflow-data', 'workflow.db'),
  },
} satisfies Config
