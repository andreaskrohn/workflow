'use client'

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { Tag } from '@/lib/db/repositories/tagRepository'
import { getCsrfToken } from '@/lib/middleware/csrf'

// ── FROZEN — Agent E only modifies the internals of these exports. ─────────────
// The export name TagContextProvider and its prop signature must never change.

// ── Types ─────────────────────────────────────────────────────────────────────

interface TagContextValue {
  /** All available tags, fetched on mount. */
  tags: Tag[]
  /** True while the initial tag list is being fetched. */
  loading: boolean
  /** Creates a new tag. Returns the created tag, or null on failure. */
  addTag: (name: string) => Promise<Tag | null>
  /** Deletes a tag by id. Silently ignores errors. */
  removeTag: (id: string) => Promise<void>
}

// ── Context ───────────────────────────────────────────────────────────────────

const TagContext = createContext<TagContextValue>({
  tags: [],
  loading: false,
  addTag: async () => null,
  removeTag: async () => {},
})

// ── Provider ──────────────────────────────────────────────────────────────────

/**
 * Fetches the global tag list on mount and exposes mutation helpers.
 * Prop signature ({ children: React.ReactNode }) is contractually frozen.
 */
export function TagContextProvider({ children }: { children: React.ReactNode }) {
  const [tags, setTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/tags')
      .then((res) => res.json())
      .then((data: Tag[]) => setTags(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const addTag = useCallback(async (name: string): Promise<Tag | null> => {
    try {
      const token = await getCsrfToken()
      const res = await fetch('/api/tags', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': token,
        },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) return null
      const tag = (await res.json()) as Tag
      setTags((prev) => [...prev, tag])
      return tag
    } catch {
      return null
    }
  }, [])

  const removeTag = useCallback(async (id: string): Promise<void> => {
    try {
      const token = await getCsrfToken()
      const res = await fetch(`/api/tags/${id}`, {
        method: 'DELETE',
        headers: { 'X-CSRF-Token': token },
      })
      if (res.ok) {
        setTags((prev) => prev.filter((t) => t.id !== id))
      }
    } catch {
      // Silent fail — tag list remains unchanged.
    }
  }, [])

  return (
    <TagContext.Provider value={{ tags, loading, addTag, removeTag }}>
      {children}
    </TagContext.Provider>
  )
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/** Returns the current tag context. Internals managed by Agent E. */
export function useTagContext(): TagContextValue {
  return useContext(TagContext)
}
