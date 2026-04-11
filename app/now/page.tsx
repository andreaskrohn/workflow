'use client'

import React, { useEffect, useMemo, useState } from 'react'
import type { Task } from '@/lib/db/repositories/taskRepository'
import { handleApiError, responseToApiError } from '@/lib/utils/errors'
import { useToast } from '@/components/shared/ToastProvider'

export default function NowPage() {
  const { showToast } = useToast()
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/tasks/now')
        if (!res.ok) throw await responseToApiError(res)
        setTasks((await res.json()) as Task[])
      } catch (err) {
        handleApiError(err, showToast)
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [showToast])

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase()
    const filtered = q ? tasks.filter((t) => t.title.toLowerCase().includes(q)) : tasks
    return [...filtered].sort((a, b) => {
      if (a.due_date === null && b.due_date === null) return 0
      if (a.due_date === null) return 1
      if (b.due_date === null) return -1
      return a.due_date - b.due_date
    })
  }, [tasks, filter])

  if (loading) {
    return <p className="p-6 text-sm text-slate-400">Loading…</p>
  }

  return (
    <main className="p-6">
      <h1 className="mb-6 text-2xl font-semibold text-white">Now</h1>

      <input
        type="search"
        aria-label="Filter tasks"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter…"
        className="mb-4 w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white placeholder-slate-400 focus:border-blue-500 focus:outline-none"
      />

      {tasks.length === 0 ? (
        <p className="text-sm text-slate-400">Nothing to do right now.</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-slate-400">No tasks match your filter.</p>
      ) : (
        <ul className="space-y-2">
          {visible.map((task) => (
            <li
              key={task.id}
              className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-white"
            >
              {task.title}
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
