'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'

interface CsrfContextValue {
  /** The current CSRF token, or `null` while the initial fetch is in flight. */
  token: string | null
}

const CsrfContext = createContext<CsrfContextValue>({ token: null })

/**
 * Fetches the CSRF token from GET /api/csrf-token on mount and makes it
 * available to the entire client tree via {@link useCsrf}.
 */
export function CsrfProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/csrf-token')
      .then((res) => res.json())
      .then((data: { token: string }) => setToken(data.token))
      .catch(() => {
        // Silent — token remains null; components should guard against this.
      })
  }, [])

  return <CsrfContext.Provider value={{ token }}>{children}</CsrfContext.Provider>
}

/** Returns the CSRF token context. Token is `null` until the fetch resolves. */
export function useCsrf(): CsrfContextValue {
  return useContext(CsrfContext)
}
