import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'

// ── Singleton CSRF token ──────────────────────────────────────────────────────
// Next.js compiles each API route into its own bundle, creating independent
// module instances. A plain module-level constant would be re-evaluated in
// every bundle, producing a different token per route.
//
// Storing on `global` ensures a single token value is shared across all route
// bundles for the lifetime of the Node.js process, even under hot-reload.
declare global {
  // eslint-disable-next-line no-var
  var __csrfToken: string | undefined
}

if (!global.__csrfToken) {
  global.__csrfToken = crypto.randomBytes(32).toString('hex')
}

export const CSRF_TOKEN = global.__csrfToken

const PROTECTED_METHODS = new Set(['POST', 'PATCH', 'DELETE'])

type Handler = (req: NextRequest, ctx?: unknown) => Promise<NextResponse>

export function withCsrf(handler: Handler): Handler {
  return async (req, ctx) => {
    if (PROTECTED_METHODS.has(req.method)) {
      const token = req.headers.get('X-CSRF-Token')
      if (token !== CSRF_TOKEN) {
        // Use process.stderr directly — pino-roll spawns a worker thread whose
        // file path resolves incorrectly inside the Next.js bundle output,
        // causing an uncaughtException crash. Structured stderr output avoids
        // this while still producing a machine-readable warning line.
        process.stderr.write(
          JSON.stringify({
            level: 'warn',
            time: Date.now(),
            pid: process.pid,
            method: req.method,
            path: req.nextUrl.pathname,
            msg: 'CSRF token mismatch',
          }) + '\n',
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
