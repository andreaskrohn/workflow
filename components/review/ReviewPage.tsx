'use client'

import React, { useEffect, useState } from 'react'
import type { WorkflowReviewItem } from '@/lib/db/repositories/reviewRepository'
import { mutate } from '@/lib/utils/mutate'
import { addDays, addMonths, dateInputToTs, tsToDateInput } from '@/lib/utils/dates'

// ── Shortcuts ─────────────────────────────────────────────────────────────────

const SHORTCUTS: { label: string; next: () => string }[] = [
  { label: '+1 week',   next: () => addDays(null, 7) },
  { label: '+2 weeks',  next: () => addDays(null, 14) },
  { label: '+1 month',  next: () => addMonths(null, 1) },
  { label: '+3 months', next: () => addMonths(null, 3) },
]

// ── Component ─────────────────────────────────────────────────────────────────

export function ReviewPage() {
  const [items, setItems] = useState<WorkflowReviewItem[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<Set<string>>(new Set())

  // ── Fetch ───────────────────────────────────────────────────────────────

  useEffect(() => {
    fetch('/api/review')
      .then((res) => res.json())
      .then((data: WorkflowReviewItem[]) => setItems(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // ── Reschedule ──────────────────────────────────────────────────────────

  async function handleReschedule(workflowId: string, nextDateStr: string) {
    const reviewDate = dateInputToTs(nextDateStr)
    if (!reviewDate) return

    setUpdating((prev) => new Set([...prev, workflowId]))
    try {
      const res = await mutate(`/api/workflows/${workflowId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ review_date: reviewDate }),
      })
      if (res.ok) {
        setItems((prev) => prev.filter((w) => w.id !== workflowId))
      }
    } catch {
      // Silent fail — workflow stays in the list.
    } finally {
      setUpdating((prev) => {
        const next = new Set(prev)
        next.delete(workflowId)
        return next
      })
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <main className="p-6 max-w-2xl">
      <h1 className="mb-6 text-2xl font-semibold text-white">Review</h1>

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-400">No workflows due for review.</p>
      ) : (
        <ul className="space-y-4">
          {items.map((item) => {
            const busy = updating.has(item.id)
            return (
              <li
                key={item.id}
                className="rounded-lg border border-slate-700 bg-slate-800 p-4"
              >
                {/* ── Header ──────────────────────────────────────────── */}
                <h2 className="text-base font-semibold text-white">{item.name}</h2>

                {item.end_goal && (
                  <p className="mt-1 text-sm text-slate-300">{item.end_goal}</p>
                )}

                {/* ── Meta row ────────────────────────────────────────── */}
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                  <span>
                    {item.enabled_task_count}{' '}
                    {item.enabled_task_count === 1 ? 'enabled task' : 'enabled tasks'}
                  </span>
                  <span>
                    Review due{' '}
                    <time dateTime={tsToDateInput(item.review_date)}>
                      {tsToDateInput(item.review_date)}
                    </time>
                  </span>
                </div>

                {/* ── Shortcuts ────────────────────────────────────────── */}
                <div className="mt-3 flex flex-wrap gap-2">
                  {SHORTCUTS.map((sc) => (
                    <button
                      key={sc.label}
                      type="button"
                      disabled={busy}
                      onClick={() => handleReschedule(item.id, sc.next())}
                      aria-label={`${sc.label} for ${item.name}`}
                      className="rounded border border-slate-600 px-2 py-1 text-xs text-slate-300 hover:border-slate-400 hover:text-white disabled:opacity-50"
                    >
                      {sc.label}
                    </button>
                  ))}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}
