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

export function TaskDetailPanel({ task, onClose, onUpdated }: TaskDetailPanelProps) {
  const { showToast } = useToast()
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description ?? '')
  const [notes, setNotes] = useState(task.notes ?? '')
  const [endGoal, setEndGoal] = useState(task.end_goal ?? '')
  const [status, setStatus] = useState(task.status)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setTitle(task.title)
    setDescription(task.description ?? '')
    setNotes(task.notes ?? '')
    setEndGoal(task.end_goal ?? '')
    setStatus(task.status)
  }, [task.id])

  async function handleSave() {
    setSaving(true)
    try {
      const token = await getCsrfToken()
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
        body: JSON.stringify({ title, description: description || null, notes: notes || null, end_goal: endGoal || null, status }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        showToast(data.error ?? 'Failed to save task.')
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
          <label className="block text-xs text-slate-400 mb-1">End Goal</label>
          <input
            value={endGoal}
            onChange={(e) => setEndGoal(e.target.value)}
            maxLength={2000}
            placeholder="What does success look like?"
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
            <option value="in_progress">In progress</option>
            <option value="done">Done</option>
            <option value="blocked">Blocked</option>
          </select>
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
