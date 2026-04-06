import { NextRequest, NextResponse } from 'next/server'
import { withCsrf } from '@/lib/middleware/csrf'
import { withPayloadLimit } from '@/lib/middleware/payloadLimit'
import { rawDb } from '@/lib/db/rawDb'
import { z, ZodError } from 'zod'

const PositionSchema = z.object({
  id: z.string().uuid('id must be a valid UUID.'),
  position_x: z.number(),
  position_y: z.number(),
})

const BulkPositionsSchema = z.object({
  positions: z.array(PositionSchema).min(1, 'At least one position is required.'),
})

async function postHandler(req: NextRequest): Promise<NextResponse> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 })
  }

  let parsed
  try {
    parsed = BulkPositionsSchema.parse(body)
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? 'Validation error.' }, { status: 422 })
    }
    throw err
  }

  const now = Math.floor(Date.now() / 1000)
  const stmt = rawDb.prepare(
    'UPDATE tasks SET position_x = ?, position_y = ?, updated_at = ? WHERE id = ?',
  )

  rawDb.transaction(() => {
    for (const { id, position_x, position_y } of parsed.positions) {
      stmt.run(position_x, position_y, now, id)
    }
  })()

  return NextResponse.json({ updated: parsed.positions.length })
}

export const POST = withPayloadLimit(withCsrf(postHandler))
