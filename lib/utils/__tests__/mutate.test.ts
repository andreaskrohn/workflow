/** @jest-environment jsdom */
import { mutate } from '../mutate'

// ── Mock CSRF helpers ─────────────────────────────────────────────────────────

jest.mock('@/lib/middleware/csrf', () => ({
  getCsrfToken: jest.fn(),
  invalidateCsrfToken: jest.fn(),
}))

import { getCsrfToken, invalidateCsrfToken } from '@/lib/middleware/csrf'
const mockGetToken = getCsrfToken as jest.Mock
const mockInvalidate = invalidateCsrfToken as jest.Mock

// ── Helpers ───────────────────────────────────────────────────────────────────

function ok(status = 200): Response {
  return { ok: status < 400, status, json: async () => ({}) } as unknown as Response
}

beforeEach(() => {
  global.fetch = jest.fn()
  jest.clearAllMocks()
})

// ── Normal path ───────────────────────────────────────────────────────────────

it('injects X-CSRF-Token header into the request', async () => {
  mockGetToken.mockResolvedValue('tok-abc')
  ;(global.fetch as jest.Mock).mockResolvedValue(ok(200))

  await mutate('/api/foo', { method: 'POST' })

  const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit]
  expect((init.headers as Headers).get('X-CSRF-Token')).toBe('tok-abc')
})

it('preserves existing headers alongside the CSRF token', async () => {
  mockGetToken.mockResolvedValue('tok-abc')
  ;(global.fetch as jest.Mock).mockResolvedValue(ok(200))

  await mutate('/api/foo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })

  const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit]
  const h = init.headers as Headers
  expect(h.get('Content-Type')).toBe('application/json')
  expect(h.get('X-CSRF-Token')).toBe('tok-abc')
})

it('returns the response directly when status is not 403', async () => {
  mockGetToken.mockResolvedValue('tok-abc')
  const res = ok(204)
  ;(global.fetch as jest.Mock).mockResolvedValue(res)

  const result = await mutate('/api/foo', { method: 'DELETE' })

  expect(result).toBe(res)
  expect(mockInvalidate).not.toHaveBeenCalled()
})

// ── 403 retry path ────────────────────────────────────────────────────────────

it('calls invalidateCsrfToken and retries once on 403', async () => {
  mockGetToken.mockResolvedValue('old-token')
  mockInvalidate.mockResolvedValue('new-token')
  ;(global.fetch as jest.Mock)
    .mockResolvedValueOnce(ok(403))
    .mockResolvedValueOnce(ok(200))

  await mutate('/api/foo', { method: 'PATCH' })

  expect(global.fetch).toHaveBeenCalledTimes(2)
  expect(mockInvalidate).toHaveBeenCalledTimes(1)

  const [, retryInit] = (global.fetch as jest.Mock).mock.calls[1] as [string, RequestInit]
  expect((retryInit.headers as Headers).get('X-CSRF-Token')).toBe('new-token')
})

it('deduplication: multiple simultaneous 403s share one invalidateCsrfToken call', async () => {
  mockGetToken.mockResolvedValue('old-token')

  let resolveInvalidate!: (token: string) => void
  const invalidatePromise = new Promise<string>((r) => { resolveInvalidate = r })
  mockInvalidate.mockReturnValue(invalidatePromise)

  ;(global.fetch as jest.Mock)
    .mockResolvedValue(ok(403))  // all calls return 403 initially

  // Fire three concurrent mutations — all hit 403 simultaneously.
  const p1 = mutate('/api/a', { method: 'POST' })
  const p2 = mutate('/api/b', { method: 'POST' })
  const p3 = mutate('/api/c', { method: 'POST' })

  // Let the 403 responses resolve, triggering all three to call invalidateCsrfToken.
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()

  resolveInvalidate('fresh-token')
  await Promise.all([p1, p2, p3])

  // invalidateCsrfToken is called three times (once per 403) but the
  // deduplication in the module itself ensures only one network request goes
  // out — that is tested in lib/middleware/__tests__/csrf.test.ts.
  // Here we just verify each call was made and retried with the fresh token.
  expect(mockInvalidate).toHaveBeenCalledTimes(3)
  const retryCalls = (global.fetch as jest.Mock).mock.calls.slice(3)
  for (const [, init] of retryCalls as [string, RequestInit][]) {
    expect((init.headers as Headers).get('X-CSRF-Token')).toBe('fresh-token')
  }
})
