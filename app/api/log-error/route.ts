import { NextRequest, NextResponse } from 'next/server'
import logger from '@/lib/logger'

interface LogErrorBody {
  errorName?: unknown
  errorMessage?: unknown
  componentStack?: unknown
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: LogErrorBody = {}
  try {
    body = (await req.json()) as LogErrorBody
  } catch {
    // Malformed body — log with whatever fields were parsed.
  }

  // Log only technical error metadata. No user content (form values, IDs, etc.)
  // is included here or forwarded from the client.
  logger.error(
    {
      errorName: typeof body.errorName === 'string' ? body.errorName : undefined,
      errorMessage: typeof body.errorMessage === 'string' ? body.errorMessage : undefined,
      componentStack: typeof body.componentStack === 'string' ? body.componentStack : undefined,
    },
    'Client-side error boundary caught an error',
  )

  return new NextResponse(null, { status: 204 })
}
