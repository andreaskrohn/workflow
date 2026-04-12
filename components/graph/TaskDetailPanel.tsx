'use client'

import React, { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import type { Task } from '@/lib/db/repositories/taskRepository'
import { mutate } from '@/lib/utils/mutate'
import { useToast } from '@/components/shared/ToastProvider'
import { handleApiError, responseToApiError } from '@/lib/utils/errors'
import { tsToDateInput, dateInputToTs, addDays, addMonths, todayString } from '@/lib/utils/dates'

const TagManager = dynamic(() => import('@/components/tags/TagManager'), {
  ssr: false,
  loading: () => null,
})

// ── Types ─────────────────────────────────────────────────────────────────────

interface TaskDetailPanelProps {
  task: Task
  onClose: () => void
  onUpdated: (task: Task) => void
}

// ── Date shortcut config ──────────────────────────────────────────────────────

const dateShortcuts = [
  { label: '+1d', fn: (v: string | null) => addDays(v, 1) },
  { label: '+1w', fn: (v: string | null) => addDays(v, 7) },
  { label: '+1m', fn: (v: string | null) => addMonths(v, 1) },
  { label: '+3m', fn: (v: string | null) => addMonths(v, 3) },
]

const reviewDateShortcuts = [
  { label: '+1w', fn: (v: string | null) => addDays(v, 7) },
  { label: '+2w', fn: (v: string | null) => addDays(v, 14) },
  { label: '+1m', fn: (v: string | null) => addMonths(v, 1) },
  { label: '+3m', fn: (v: string | null) => addMonths(v, 3) },
]

// ── Component ─────────────────────────────────────────────────────────────────

export function TaskDetailPanel({ task, onClose, onUpdated }: TaskDetailPanelProps) {
  const { showToast } = useToast()
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description ?? '')
  const [notes, setNotes] = useState(task.notes ?? '')
  const [status, setStatus] = useState(task.status)
  const [dueDateInput, setDueDateInput] = useState(tsToDateInput(task.due_date))
  const [deferDateInput, setDeferDateInput] = useState(tsToDateInput(task.defer_date))
  const [reviewDateInput, setReviewDateInput] = useState(tsToDateInput(task.review_date))
  const [saving, setSaving] = useState(false)
  const today = todayString()

  useEffect(() => {
    setTitle(task.title)
    setDescription(task.description ?? '')
    setNotes(task.notes ?? '')
    setStatus(task.status)
    setDueDateInput(tsToDateInput(task.due_date))
    setDeferDateInput(tsToDateInput(task.defer_date))
    setReviewDateInput(tsToDateInput(task.review_date))
  }, [task.id])

  async function handleSave() {
    setSaving(true)
    try {
      const res = await mutate(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description: description || null,
          notes: notes || null,
          status,
          due_date: dateInputToTs(dueDateInput),
          defer_date: dateInputToTs(deferDateInput),
          review_date: dateInputToTs(reviewDateInput),
        }),
      })
      if (!res.ok) throw await responseToApiError(res)
      const updated: Task = await res.json()
      onUpdated(updated)
    } catch (err) {
      handleApiError(err, showToast)
    } finally {
      setSaving(false)
    }
  }

  return (
    <aside className="w-80 flex-shrink-0 border-l border-slate-700 bg-slate-900 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
        <h2 className="text-sm font-semibold text-white">Task Detail</h2>
        <button
          onClick={onClose}
          aria-label="Close"
          className="text-slate-400 hover:text-white text-lg leading-none"
        >
          ×
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Title */}
        <div>
          <label className="block text-xs text-slate-400 mb-1">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={500}
            className="w-full rounded bg-slate-800 border border-slate-600 px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Status */}
        <div>
          <label className="block text-xs text-slate-400 mb-1">Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as Task['status'])}
            className="w-full rounded bg-slate-800 border border-slate-600 px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
          >
            <option value="todo">To do</option>
            <option value="done">Done</option>
            <option value="blocked">Blocked</option>
          </select>
        </div>

        {/* Due date */}
        <div>
          <label className="block text-xs text-slate-400 mb-1">Due date</label>
          <input
            type="date"
            value={dueDateInput}
            min={today}
            onChange={(e) => setDueDateInput(e.target.value)}
            className="w-full rounded bg-slate-800 border border-slate-600 px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
          />
          <div className="flex gap-1 mt-1 flex-wrap">
            {dateShortcuts.map(({ label, fn }) => (
              <button
                key={label}
                type="button"
                onClick={() => setDueDateInput(fn(dueDateInput || null))}
                className="text-xs px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-white"
              >
                {label}
              </button>
            ))}
            {dueDateInput && (
              <button
                type="button"
                onClick={() => setDueDateInput('')}
                className="text-xs px-1.5 py-0.5 rounded bg-slate-700 text-slate-400 hover:bg-slate-600 hover:text-white"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Defer until */}
        <div>
          <label className="block text-xs text-slate-400 mb-1">Defer until</label>
          <input
            type="date"
            value={deferDateInput}
            min={today}
            onChange={(e) => setDeferDateInput(e.target.value)}
            className="w-full rounded bg-slate-800 border border-slate-600 px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
          />
          <div className="flex gap-1 mt-1 flex-wrap">
            {dateShortcuts.map(({ label, fn }) => (
              <button
                key={label}
                type="button"
                onClick={() => setDeferDateInput(fn(deferDateInput || null))}
                className="text-xs px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-white"
              >
                {label}
              </button>
            ))}
            {deferDateInput && (
              <button
                type="button"
                onClick={() => setDeferDateInput('')}
                className="text-xs px-1.5 py-0.5 rounded bg-slate-700 text-slate-400 hover:bg-slate-600 hover:text-white"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Review date */}
        <div>
          <label className="block text-xs text-slate-400 mb-1">Review date</label>
          <input
            aria-label="Review date"
            type="date"
            value={reviewDateInput}
            min={today}
            onChange={(e) => setReviewDateInput(e.target.value)}
            className="w-full rounded bg-slate-800 border border-slate-600 px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
          />
          <div className="flex gap-1 mt-1 flex-wrap">
            {reviewDateShortcuts.map(({ label, fn }) => (
              <button
                key={label}
                type="button"
                onClick={() => setReviewDateInput(fn(reviewDateInput || null))}
                className="text-xs px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-white"
              >
                {label}
              </button>
            ))}
            {reviewDateInput && (
              <button
                type="button"
                onClick={() => setReviewDateInput('')}
                className="text-xs px-1.5 py-0.5 rounded bg-slate-700 text-slate-400 hover:bg-slate-600 hover:text-white"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs text-slate-400 mb-1">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={2000}
            rows={4}
            className="w-full rounded bg-slate-800 border border-slate-600 px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 resize-none"
          />
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs text-slate-400 mb-1">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={2000}
            rows={4}
            className="w-full rounded bg-slate-800 border border-slate-600 px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 resize-none"
          />
        </div>

        {/* Tags */}
        <div>
          <label className="block text-xs text-slate-400 mb-2">Tags</label>
          <TagManager taskId={task.id} />
        </div>
      </div>

      <div className="border-t border-slate-700 px-4 py-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="w-full rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </aside>
  )
}
