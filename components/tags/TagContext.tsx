'use client'

import React from 'react'

// ── FROZEN — Agent E only modifies the internals of these exports. ─────────────
// The export name TagContextProvider and its prop signature must never change.

/**
 * Stub tag context provider. Internal implementation managed by Agent E.
 * Prop signature ({ children: React.ReactNode }) is contractually frozen.
 */
export function TagContextProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

/** Returns the current tag context. Internals managed by Agent E. */
export function useTagContext() {
  return { tags: [] as string[], addTag: (_tag: string) => {}, removeTag: (_tag: string) => {} }
}
