import { NextResponse } from 'next/server'
import { CSRF_TOKEN } from '@/lib/middleware/csrf'

export function GET() {
  return NextResponse.json({ token: CSRF_TOKEN })
}
