import { NextRequest, NextResponse } from 'next/server'
import { rawDb } from '@/lib/db/rawDb'
import { evaluateWorkflowStates } from '@/lib/graph/evaluateWorkflowStates'

type Ctx = { params: { id: string } }

export async function GET(_req: NextRequest, ctx: Ctx) {
  const states = evaluateWorkflowStates(rawDb, ctx.params.id)
  return NextResponse.json(states)
}
