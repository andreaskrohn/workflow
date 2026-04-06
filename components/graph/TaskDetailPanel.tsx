'use client'
import React, { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import type { Task } from '@/lib/db/repositories/taskRepository'
import { getCsrfToken } from '@/lib/middleware/csrf'
import { useToast } from '@/components/shared/ToastProvider'

const TagManager = dynamic(() => import('@/components/tags/TagManager'), {
  ssr: false,
  loading: () => null,
})

interface TaskDetailPanelProps {
  task: Task
  onClose: () => void
  onUpdated: (task: Task) => void
}

function todayString(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
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

function addDays(base: string | null, days: number): string {
  const from = base ? new Date(base + 'T00:00:00') : new Date()
  from.setDate(from.getDate() + days)
  const yyyy = from.getFullYear()
  const mm = String(from.getMonth() + 1).padStart(2, '0')
  const dd = String(from.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function addMonths(base: string | null, months: number): string {
  const from = base ? new Date(base + 'T00:00:00') : new Date()
  from.setMonth(from.getMonth() + months)
  const yyyy = from.getFullYear()
  const mm = String(from.getMonth() + 1).padStart(2, '0')
  const dd = String(from.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

const dateShortcuts = [
  { label: '+1d', fn: (v: string | null) => addDays(v, 1) },
  { label: '+1w', fn: (v: string | null) => addDays(v, 7) },
  { label: '+1m', fn: (v: string | null) => addMonths(v, 1) },
  { label: '+3m', fn: (v: string | null) => addMonths(v, 3) },
]

export function TaskDetailPanel({ task, onClose, onUpdated }: TaskDetailPanelProps) {
  const { showToast } = useToast()
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description ?? '')
  const [notes, setNotes] = useState(task.notes ?? '')
  const [status, setStatus] = useState(task.status)
  const [dueDateInput, setDueDateInput] = useState(tsToDateInput(task.due_date))
  const [deferDateInput, setDeferDateInput] = useState(tsToDateInput(task.defer_date))
  const [saving, setSaving] = useState(false)
  const today = todayString()

  useEffect(() => {
    setTitle(task.title)
    setDescription(task.description ?? '')
    setNotes(task.notes ?? '')
    setStatus(task.status)
    setDueDateInput(tsToDateInput(task.due_date))
    setDeferDateInput(tsToDateInput(task.defer_date))
  }, [task.id])

  async function handleSave() {
    setSaving(true)
    try {
      const token = await getCsrfToken()
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
        body: JSON.stringify({
          title,
          description: description || null,
          notes: notes || null,
          status,
          due_date: dateInputToTs(dueDateInput),
          defer_date: dateInputToTs(deferDateInput),
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        showToast((data as { error?: string }).error ?? 'Failed to save task.')
        return
      }
      const updated: Task = await res.json()
      onUpdated(updated)
    } finally {
      setSaving(false)
    }
  }

  return (
    <aside className="w-80 flex-shrink-0 border-l border-slate-700 bg-slate-900 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
        <h2 className="text-sm font-semibold text-white">Task Detail</h2>
        <button onClick={onClose} className="text-slate-400 hover:text-white text-lg leading-none">×</button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={500}
            className="w-full rounded bg-slate-800 border border-slate-600 px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
          />
        </div>

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
                onClick={() => setDueDateInput(fn(dueDateInput || null))}
                className="text-xs px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-white"
              >
                {label}
              </button>
            ))}
            {dueDateInput && (
              <button
                onClick={() => setDueDateInput('')}
                className="text-xs px-1.5 py-0.5 rounded bg-slate-700 text-slate-400 hover:bg-slate-600 hover:text-white"
              >
                Clear
              </button>
            )}
          </div>
        </div>

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
                onClick={() => setDeferDateInput(fn(deferDateInput || null))}
                className="text-xs px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-white"
              >
                {label}
              </button>
            ))}
            {deferDateInput && (
              <button
                onClick={() => setDeferDateInput('')}
                className="text-xs px-1.5 py-0.5 rounded bg-slate-700 text-slate-400 hover:bg-slate-600 hover:text-white"
              >
                Clear
              </button>
            )}
          </div>
        </div>

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

        <div>
          <label className="block text-xs text-slate-400 mb-2">Tags</label>
          <TagManager taskId={task.id} />
        </div>
      </div>

      <div className="border-t border-slate-700 px-4 py-3">
        <button
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
