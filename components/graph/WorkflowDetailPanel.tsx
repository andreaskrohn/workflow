'use client'
import React, { useState, useEffect } from 'react'
import type { Workflow } from '@/lib/db/repositories/workflowRepository'
import { getCsrfToken } from '@/lib/middleware/csrf'
import { useToast } from '@/components/shared/ToastProvider'

interface WorkflowDetailPanelProps {
  workflow: Workflow
  onClose: () => void
  onUpdated: (workflow: Workflow) => void
}

function tsToDateInput(ts: number | null): string {
  if (!ts) return ''
  const d = new Date(ts * 1000)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function dateInputToTs(val: string): number | null {
  if (!val) return null
  const d = new Date(val + 'T00:00:00')
  return isNaN(d.getTime()) ? null : Math.floor(d.getTime() / 1000)
}

function todayString(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export function WorkflowDetailPanel({ workflow, onClose, onUpdated }: WorkflowDetailPanelProps) {
  const { showToast } = useToast()
  const [name, setName] = useState(workflow.name)
  const [endGoal, setEndGoal] = useState(workflow.end_goal ?? '')
  const [dueDateInput, setDueDateInput] = useState(tsToDateInput(workflow.due_date))
  const [saving, setSaving] = useState(false)
  const today = todayString()

  useEffect(() => {
    setName(workflow.name)
    setEndGoal(workflow.end_goal ?? '')
    setDueDateInput(tsToDateInput(workflow.due_date))
  }, [workflow.id])

  async function handleSave() {
    if (!name.trim()) {
      showToast('Workflow name is required.')
      return
    }
    setSaving(true)
    try {
      const token = await getCsrfToken()
      const res = await fetch(`/api/workflows/${workflow.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
        body: JSON.stringify({
          name: name.trim(),
          end_goal: endGoal.trim() || null,
          due_date: dateInputToTs(dueDateInput),
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        showToast((data as { error?: string }).error ?? 'Failed to save.')
        return
      }
      const updated: Workflow = await res.json()
      onUpdated(updated)
    } finally {
      setSaving(false)
    }
  }

  return (
    <aside className="w-80 flex-shrink-0 border-l border-slate-700 bg-slate-900 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
        <h2 className="text-sm font-semibold text-white">Workflow Detail</h2>
        <button onClick={onClose} className="text-slate-400 hover:text-white text-lg leading-none">×</button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
            className="w-full rounded bg-slate-800 border border-slate-600 px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
          />
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-1">End goal</label>
          <textarea
            value={endGoal}
            onChange={(e) => setEndGoal(e.target.value)}
            maxLength={2000}
            rows={4}
            placeholder="What does success look like?"
            className="w-full rounded bg-slate-800 border border-slate-600 px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500 resize-none"
          />
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-1">Due date</label>
          <input
            type="date"
            value={dueDateInput}
            min={today}
            onChange={(e) => setDueDateInput(e.target.value)}
            className="w-full rounded bg-slate-800 border border-slate-600 px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
          />
          {dueDateInput && (
            <button
              onClick={() => setDueDateInput('')}
              className="mt-1 text-xs text-slate-400 hover:text-white"
            >
              Clear due date
            </button>
          )}
        </div>
      </div>

      <div className="border-t border-slate-700 px-4 py-3">
        <button
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
