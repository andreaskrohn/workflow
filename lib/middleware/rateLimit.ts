import { NextRequest, NextResponse } from 'next/server'

const WINDOW_MS = 10_000 // 10 seconds
const MAX_REQUESTS = 100

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

function clientKey(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  )
}

type Handler = (req: NextRequest, ctx?: unknown) => Promise<NextResponse>

export function withRateLimit(handler: Handler): Handler {
  return async (req, ctx) => {
    const key = clientKey(req)
    const now = Date.now()

    let bucket = buckets.get(key)
    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + WINDOW_MS }
      buckets.set(key, bucket)
    }

    bucket.count++

    if (bucket.count > MAX_REQUESTS) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000)
      return new NextResponse('Too Many Requests', {
        status: 429,
        headers: { 'Retry-After': String(retryAfter) },
      })
    }

    return handler(req, ctx)
  }
}
