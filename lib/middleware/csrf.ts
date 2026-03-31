import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'

// 32-byte hex token generated once at process startup.
export const CSRF_TOKEN = crypto.randomBytes(32).toString('hex')

const PROTECTED_METHODS = new Set(['POST', 'PATCH', 'DELETE'])

type Handler = (req: NextRequest, ctx?: unknown) => Promise<NextResponse>

export function withCsrf(handler: Handler): Handler {
  return async (req, ctx) => {
    if (PROTECTED_METHODS.has(req.method)) {
      const token = req.headers.get('X-CSRF-Token')
      if (token !== CSRF_TOKEN) {
        // Dynamic import keeps pino out of client bundles that import only the
        // client helpers below.
        const { default: logger } = await import('../logger')
        logger.warn(
          { method: req.method, path: req.nextUrl.pathname },
          'CSRF token mismatch',
        )
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }
    return handler(req, ctx)
  }
}

// ── Client-side helpers ───────────────────────────────────────────────────────
// These functions are safe to import in client components: they reference no
// Node.js-specific modules.

let _cachedToken: string | null = null
let _refreshPromise: Promise<string> | null = null

async function fetchNewToken(): Promise<string> {
  const res = await fetch('/api/csrf-token')
  if (!res.ok) throw new Error('Failed to fetch CSRF token.')
  const { token } = (await res.json()) as { token: string }
  _cachedToken = token
  return token
}

/** Returns the cached CSRF token, fetching it once if not yet loaded. */
export function getCsrfToken(): Promise<string> {
  if (_cachedToken) return Promise.resolve(_cachedToken)
  if (!_refreshPromise) {
    _refreshPromise = fetchNewToken().finally(() => {
      _refreshPromise = null
    })
  }
  return _refreshPromise
}

/**
 * Invalidates the cached token and fetches a new one.
 * Multiple simultaneous 403 responses all share one refresh request.
 */
export function invalidateCsrfToken(): Promise<string> {
  _cachedToken = null
  if (!_refreshPromise) {
    _refreshPromise = fetchNewToken().finally(() => {
      _refreshPromise = null
    })
  }
  return _refreshPromise
}
