import { NextRequest, NextResponse } from 'next/server'
import { withCsrf } from '@/lib/middleware/csrf'
import { withPayloadLimit } from '@/lib/middleware/payloadLimit'
import { rawDb } from '@/lib/db/rawDb'
import { z, ZodError } from 'zod'

interface AppSettingsRow {
  id: number
  end_goal: string | null
  updated_at: number
}

function ensureAppSettingsRow(): AppSettingsRow {
  const existing = rawDb.prepare('SELECT * FROM app_settings WHERE id = 1').get() as AppSettingsRow | undefined
  if (!existing) {
    const now = Math.floor(Date.now() / 1000)
    rawDb.prepare('INSERT OR IGNORE INTO app_settings (id, end_goal, updated_at) VALUES (1, NULL, ?)').run(now)
  }
  return rawDb.prepare('SELECT * FROM app_settings WHERE id = 1').get() as AppSettingsRow
}

export async function GET() {
  return NextResponse.json(ensureAppSettingsRow())
}

const PatchSchema = z.object({
  end_goal: z
    .string()
    .max(2000, 'End goal must not exceed 2,000 characters.')
    .nullable()
    .optional(),
})

async function patchHandler(req: NextRequest): Promise<NextResponse> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 })
  }

  let parsed
  try {
    parsed = PatchSchema.parse(body)
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? 'Validation error.' }, { status: 422 })
    }
    throw err
  }

  const now = Math.floor(Date.now() / 1000)
  ensureAppSettingsRow()
  rawDb
    .prepare('UPDATE app_settings SET end_goal = ?, updated_at = ? WHERE id = 1')
    .run(parsed.end_goal ?? null, now)

  return NextResponse.json(rawDb.prepare('SELECT * FROM app_settings WHERE id = 1').get())
}

export const PATCH = withPayloadLimit(withCsrf(patchHandler))
