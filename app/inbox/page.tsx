'use client'

import React, { useEffect, useState } from 'react'
import type { Task } from '@/lib/db/repositories/taskRepository'
import type { Workflow } from '@/lib/db/repositories/workflowRepository'
import { getCsrfToken } from '@/lib/middleware/csrf'
import { handleApiError, responseToApiError } from '@/lib/utils/errors'
import { useToast } from '@/components/shared/ToastProvider'

export default function InboxPage() {
  const { showToast } = useToast()
  const [tasks, setTasks] = useState<Task[]>([])
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [loading, setLoading] = useState(true)
  const [assigning, setAssigning] = useState<string | null>(null)
  // taskId → selected workflowId
  const [selections, setSelections] = useState<Record<string, string>>({})
  // taskId → field errors from a failed PATCH
  const [assignErrors, setAssignErrors] = useState<Record<string, Record<string, string>>>({})

  useEffect(() => {
    async function load() {
      try {
        const [tasksRes, workflowsRes] = await Promise.all([
          fetch('/api/tasks?inbox=1'),
          fetch('/api/workflows'),
        ])
        if (!tasksRes.ok) throw await responseToApiError(tasksRes)
        if (!workflowsRes.ok) throw await responseToApiError(workflowsRes)
        setTasks((await tasksRes.json()) as Task[])
        setWorkflows((await workflowsRes.json()) as Workflow[])
      } catch (err) {
        handleApiError(err, showToast)
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [showToast])

  async function handleAssign(taskId: string) {
    const workflowId = selections[taskId]
    if (!workflowId) return

    setAssigning(taskId)
    setAssignErrors((prev) => ({ ...prev, [taskId]: {} }))

    try {
      const token = await getCsrfToken()
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
        body: JSON.stringify({ workflow_id: workflowId }),
      })
      if (!res.ok) throw await responseToApiError(res)
      setTasks((prev) => prev.filter((t) => t.id !== taskId))
    } catch (err) {
      const errors = handleApiError(err, showToast)
      if (Object.keys(errors).length > 0) {
        setAssignErrors((prev) => ({ ...prev, [taskId]: errors }))
      }
    } finally {
      setAssigning(null)
    }
  }

  if (loading) {
    return <p className="p-6 text-sm text-slate-400">Loading…</p>
  }

  return (
    <main className="p-6">
      <h1 className="mb-6 text-2xl font-semibold text-white">Inbox</h1>

      {tasks.length === 0 ? (
        <p className="text-sm text-slate-400">Your inbox is empty.</p>
      ) : (
        <ul className="space-y-2">
          {tasks.map((task) => (
            <li
              key={task.id}
              className="flex flex-col gap-1 rounded-lg border border-slate-700 bg-slate-800 px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <span className="flex-1 text-sm text-white">{task.title}</span>

                <select
                  value={selections[task.id] ?? ''}
                  onChange={(e) =>
                    setSelections((prev) => ({ ...prev, [task.id]: e.target.value }))
                  }
                  aria-label={`Assign "${task.title}" to a workflow`}
                  className="rounded border border-slate-600 bg-slate-700 px-2 py-1 text-sm text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="">— select workflow —</option>
                  {workflows.map((wf) => (
                    <option key={wf.id} value={wf.id}>
                      {wf.name}
                    </option>
                  ))}
                </select>

                <button
                  onClick={() => handleAssign(task.id)}
                  disabled={!selections[task.id] || assigning === task.id}
                  className="rounded bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
                >
                  {assigning === task.id ? 'Assigning…' : 'Assign'}
                </button>
              </div>

              {assignErrors[task.id]?.workflow_id && (
                <p className="text-xs text-red-400">{assignErrors[task.id].workflow_id}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
