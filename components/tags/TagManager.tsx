'use client'

import React, { useCallback, useEffect, useState } from 'react'
import type { Tag } from '@/lib/db/repositories/tagRepository'
import { mutate } from '@/lib/utils/mutate'
import { useTagContext } from './TagContext'

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Manages the tags on a specific task.
 *
 * - taskId comes from the caller as a direct prop (Agent A calls
 *   <TagManager taskId={task.id} />).
 * - The global tag list is read from TagContext internally.
 * - The task's own tag associations are fetched from
 *   GET /api/tasks/[taskId]/tags on mount and when taskId changes.
 */
export default function TagManager({ taskId }: { taskId: string }) {
  const { tags: allTags } = useTagContext()
  const [taskTags, setTaskTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)

  // ── Fetch this task's tags whenever taskId changes ────────────────────────

  useEffect(() => {
    let cancelled = false
    setTaskTags([])
    setLoading(true)

    fetch(`/api/tasks/${taskId}/tags`)
      .then((res) => res.json())
      .then((data: Tag[]) => {
        if (!cancelled) setTaskTags(data)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [taskId])

  // ── Mutations ─────────────────────────────────────────────────────────────

  const addTag = useCallback(
    async (tagId: string) => {
      try {
        const res = await mutate(`/api/tasks/${taskId}/tags`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tagId }),
        })
        if (res.ok) {
          const added = allTags.find((t) => t.id === tagId)
          if (added) setTaskTags((prev) => [...prev, added])
        }
      } catch {
        // Silent fail — no toast; caller can observe nothing changed.
      }
    },
    [taskId, allTags],
  )

  const removeTag = useCallback(
    async (tagId: string) => {
      try {
        const res = await mutate(`/api/tasks/${taskId}/tags/${tagId}`, { method: 'DELETE' })
        if (res.ok) {
          setTaskTags((prev) => prev.filter((t) => t.id !== tagId))
        }
      } catch {
        // Silent fail.
      }
    },
    [taskId],
  )

  // ── Derived state ─────────────────────────────────────────────────────────

  const assignedIds = new Set(taskTags.map((t) => t.id))
  const available = allTags.filter((t) => !assignedIds.has(t.id))

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div
        aria-busy="true"
        aria-label="Loading tags"
        className="text-xs text-slate-500"
      >
        Loading…
      </div>
    )
  }

  return (
    <div>
      {/* Current task tags — removable chips */}
      {taskTags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {taskTags.map((tag) => (
            <span
              key={tag.id}
              className="inline-flex items-center gap-1 rounded bg-slate-700 px-2 py-0.5 text-xs text-slate-200"
            >
              {tag.name}
              <button
                type="button"
                onClick={() => removeTag(tag.id)}
                aria-label={`Remove ${tag.name}`}
                className="text-slate-400 hover:text-white leading-none"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Available tags — one-click add buttons */}
      {available.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {available.map((tag) => (
            <button
              key={tag.id}
              type="button"
              onClick={() => addTag(tag.id)}
              aria-label={`Add ${tag.name}`}
              className="rounded border border-slate-600 px-1.5 py-0.5 text-xs text-slate-400 hover:border-slate-400 hover:text-slate-200"
            >
              + {tag.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
