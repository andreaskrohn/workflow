'use client'
import React, { useState, useEffect } from 'react'
import { marked } from 'marked'
import type { Workflow } from '@/lib/db/repositories/workflowRepository'
import { mutate } from '@/lib/utils/mutate'
import { handleApiError, responseToApiError } from '@/lib/utils/errors'
import { useToast } from '@/components/shared/ToastProvider'
import { tsToDateInput, dateInputToTs, addDays, addMonths, todayString } from '@/lib/utils/dates'

interface WorkflowDetailPanelProps {
  workflow: Workflow
  onClose: () => void
  onUpdated: (workflow: Workflow) => void
}

// ── Review date shortcut config ───────────────────────────────────────────────

const reviewDateShortcuts = [
  { label: '+1w', fn: (v: string | null) => addDays(v, 7) },
  { label: '+2w', fn: (v: string | null) => addDays(v, 14) },
  { label: '+1m', fn: (v: string | null) => addMonths(v, 1) },
  { label: '+3m', fn: (v: string | null) => addMonths(v, 3) },
]

// ── Component ─────────────────────────────────────────────────────────────────

export function WorkflowDetailPanel({ workflow, onClose, onUpdated }: WorkflowDetailPanelProps) {
  const { showToast } = useToast()
  const [name, setName] = useState(workflow.name)
  const [endGoal, setEndGoal] = useState(workflow.end_goal ?? '')
  const [endGoalTab, setEndGoalTab] = useState<'write' | 'preview'>('write')
  const [dueDateInput, setDueDateInput] = useState(tsToDateInput(workflow.due_date))
  const [reviewDateInput, setReviewDateInput] = useState(tsToDateInput(workflow.review_date))
  const [saving, setSaving] = useState(false)
  const today = todayString()

  useEffect(() => {
    setName(workflow.name)
    setEndGoal(workflow.end_goal ?? '')
    setEndGoalTab('write')
    setDueDateInput(tsToDateInput(workflow.due_date))
    setReviewDateInput(tsToDateInput(workflow.review_date))
  }, [workflow.id])

  async function handleSave() {
    if (!name.trim()) {
      showToast('Workflow name is required.')
      return
    }
    setSaving(true)
    try {
      const res = await mutate(`/api/workflows/${workflow.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          end_goal: endGoal.trim() || null,
          due_date: dateInputToTs(dueDateInput),
          review_date: dateInputToTs(reviewDateInput),
        }),
      })
      if (!res.ok) throw await responseToApiError(res)
      const updated: Workflow = await res.json()
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
        <h2 className="text-sm font-semibold text-white">Workflow Detail</h2>
        <button
          onClick={onClose}
          aria-label="Close"
          className="text-slate-400 hover:text-white text-lg leading-none"
        >
          ×
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Name */}
        <div>
          <label className="block text-xs text-slate-400 mb-1">Name</label>
          <input
            aria-label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
            className="w-full rounded bg-slate-800 border border-slate-600 px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* End goal with markdown preview */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-slate-400">End goal</label>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setEndGoalTab('write')}
                aria-selected={endGoalTab === 'write'}
                className={`text-xs px-2 py-0.5 rounded ${endGoalTab === 'write' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                Write
              </button>
              <button
                type="button"
                onClick={() => setEndGoalTab('preview')}
                aria-selected={endGoalTab === 'preview'}
                className={`text-xs px-2 py-0.5 rounded ${endGoalTab === 'preview' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                Preview
              </button>
            </div>
          </div>
          {endGoalTab === 'write' ? (
            <textarea
              aria-label="End goal"
              value={endGoal}
              onChange={(e) => setEndGoal(e.target.value)}
              maxLength={2000}
              rows={4}
              placeholder="What does success look like?"
              className="w-full rounded bg-slate-800 border border-slate-600 px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500 resize-none"
            />
          ) : (
            <div
              data-testid="end-goal-preview"
              className="min-h-[6rem] rounded bg-slate-800 border border-slate-600 px-3 py-2 text-sm text-slate-200 prose prose-invert prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: marked.parse(endGoal) as string }}
            />
          )}
        </div>

        {/* Due date */}
        <div>
          <label className="block text-xs text-slate-400 mb-1">Due date</label>
          <input
            aria-label="Due date"
            type="date"
            value={dueDateInput}
            min={today}
            onChange={(e) => setDueDateInput(e.target.value)}
            className="w-full rounded bg-slate-800 border border-slate-600 px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
          />
          {dueDateInput && (
            <button
              type="button"
              onClick={() => setDueDateInput('')}
              className="mt-1 text-xs text-slate-400 hover:text-white"
            >
              Clear due date
            </button>
          )}
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
            className="w-full rounded bg-slate-800 border border-slate-600 px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
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
      </div>

      <div className="border-t border-slate-700 px-4 py-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="w-full rounded bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-500 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </aside>
  )
}
