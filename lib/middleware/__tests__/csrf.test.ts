import { NextRequest } from 'next/server'
import { CSRF_TOKEN, withCsrf } from '../csrf'

function makeRequest(method: string, token?: string): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (token !== undefined) headers['x-csrf-token'] = token
  return new NextRequest('http://localhost/api/test', { method, headers })
}

async function passthrough(req: NextRequest) {
  const { NextResponse } = await import('next/server')
  return NextResponse.json({ ok: true })
}

// ── Token singleton ───────────────────────────────────────────────────────────

describe('CSRF_TOKEN singleton', () => {
  it('is a 64-character hex string (32 bytes)', () => {
    expect(CSRF_TOKEN).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is stored on global.__csrfToken', () => {
    // Verifies the singleton mechanism: re-importing the module must return
    // the same token value that is already on global, not a newly generated one.
    // This is the exact condition that caused the 403 bug — each Next.js route
    // bundle re-evaluated the module and got a different token.
    expect(CSRF_TOKEN).toBe(global.__csrfToken)
  })

  it('returns the same token on repeated imports (no re-generation)', async () => {
    // Simulate a second bundle importing the module by re-requiring it after
    // resetting the module registry.  The global guard must prevent a new token.
    const originalToken = global.__csrfToken

    // Evict from Jest's module cache so the module body runs again.
    jest.resetModules()
    const { CSRF_TOKEN: reimported } = await import('../csrf')

    expect(reimported).toBe(originalToken)
  })
})

// ── withCsrf middleware ───────────────────────────────────────────────────────

describe('withCsrf', () => {
  let stderrSpy: jest.SpyInstance

  beforeEach(() => {
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('calls the handler when the correct token is present on POST', async () => {
    const handler = jest.fn(passthrough)
    const wrapped = withCsrf(handler)
    const res = await wrapped(makeRequest('POST', CSRF_TOKEN))
    expect(res.status).toBe(200)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('returns 403 when the token is missing on POST', async () => {
    const wrapped = withCsrf(passthrough)
    const res = await wrapped(makeRequest('POST'))
    expect(res.status).toBe(403)
  })

  it('returns 403 when the token is wrong on POST', async () => {
    const wrapped = withCsrf(passthrough)
    const res = await wrapped(makeRequest('POST', 'bad-token'))
    expect(res.status).toBe(403)
  })

  it('returns 403 with JSON body { error: "Forbidden" }', async () => {
    const wrapped = withCsrf(passthrough)
    const res = await wrapped(makeRequest('POST', 'bad-token'))
    const body = await res.json()
    expect(body).toEqual({ error: 'Forbidden' })
  })

  it('writes a structured NDJSON warning to stderr on mismatch', async () => {
    // Regression guard for two bugs fixed together:
    //
    // Bug 1 (pino-roll crash): the original code did `await import('../logger')`
    // on CSRF failure.  Inside a Next.js bundle, pino-roll spawns a worker
    // thread whose file resolves to .next/server/vendor-chunks/lib/worker.js —
    // a path that does not exist — crashing the process with ERR_MODULE_NOT_FOUND.
    // Fix: write directly to process.stderr instead.
    //
    // This test enforces that fix: pino writes to process.stdout by default.
    // If the code reverts to logger.warn(), nothing appears on stderr and the
    // assertions below fail — catching the regression automatically.
    const wrapped = withCsrf(passthrough)
    await wrapped(makeRequest('POST', 'wrong'))

    const written = stderrSpy.mock.calls.map((c) => String(c[0])).join('')
    const parsed = JSON.parse(written.trim())
    expect(parsed.msg).toBe('CSRF token mismatch')
    expect(parsed.level).toBe('warn')
    expect(parsed.method).toBe('POST')
    expect(typeof parsed.time).toBe('number')
    expect(typeof parsed.pid).toBe('number')
  })

  it('allows GET requests through without a token', async () => {
    const wrapped = withCsrf(passthrough)
    const res = await wrapped(makeRequest('GET'))
    expect(res.status).toBe(200)
  })

  it('allows PATCH through with correct token', async () => {
    const wrapped = withCsrf(passthrough)
    const res = await wrapped(makeRequest('PATCH', CSRF_TOKEN))
    expect(res.status).toBe(200)
  })

  it('blocks DELETE with wrong token', async () => {
    const wrapped = withCsrf(passthrough)
    const res = await wrapped(makeRequest('DELETE', 'nope'))
    expect(res.status).toBe(403)
  })
})
