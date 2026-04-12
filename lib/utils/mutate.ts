import { getCsrfToken, invalidateCsrfToken } from '@/lib/middleware/csrf'

function withToken(init: RequestInit, token: string): RequestInit {
  const h = new Headers(init.headers as HeadersInit | undefined)
  h.set('X-CSRF-Token', token)
  return { ...init, headers: h }
}

/**
 * Sends a mutating fetch request with automatic CSRF token injection and
 * one-shot retry on 403.
 *
 * On a 403 response (stale token after server restart), calls
 * {@link invalidateCsrfToken} — which is itself deduplicated so that multiple
 * concurrent 403s only trigger a single token re-fetch — then retries the
 * request once with the fresh token.
 *
 * @param url  Request URL.
 * @param init Fetch init **without** `X-CSRF-Token` — that header is injected
 *             automatically.
 */
export async function mutate(url: string, init: RequestInit = {}): Promise<Response> {
  const token = await getCsrfToken()
  const res = await fetch(url, withToken(init, token))
  if (res.status !== 403) return res
  const fresh = await invalidateCsrfToken()
  return fetch(url, withToken(init, fresh))
}
