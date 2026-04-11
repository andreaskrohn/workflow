import { NextResponse } from 'next/server'
import { rawDb } from '@/lib/db/rawDb'
import { listNowTasks } from '@/lib/db/repositories/nowRepository'

export async function GET() {
  return NextResponse.json(listNowTasks(rawDb))
}
