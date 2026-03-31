import { NextRequest, NextResponse } from 'next/server'

const MAX_BYTES = 5 * 1024 * 1024 // 5 MB

type Handler = (req: NextRequest, ctx?: unknown) => Promise<NextResponse>

export function withPayloadLimit(handler: Handler): Handler {
  return async (req, ctx) => {
    const contentLength = req.headers.get('content-length')
    if (contentLength !== null && parseInt(contentLength, 10) > MAX_BYTES) {
      return new NextResponse('Payload Too Large', { status: 413 })
    }
    return handler(req, ctx)
  }
}
