'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import type { Task } from '@/lib/db/repositories/taskRepository'
import { mutate } from '@/lib/utils/mutate'
import { handleApiError, responseToApiError } from '@/lib/utils/errors'
import { useKeyboardShortcuts } from '@/lib/hooks/useKeyboardShortcuts'
import { useToast } from '@/components/shared/ToastProvider'

export default function NowPage() {
  const { showToast } = useToast()
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null)
  const [lastCompleted, setLastCompleted] = useState<Task | null>(null)

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

  const completeTask = useCallback(
    async (task: Task) => {
      setTasks((prev) => prev.filter((t) => t.id !== task.id))
      setLastCompleted(task)
      setFocusedIndex(null)
      try {
        const res = await mutate(`/api/tasks/${task.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'done' }),
        })
        if (!res.ok) {
          // Revert optimistic update.
          setTasks((prev) => [...prev, task])
          setLastCompleted(null)
          throw await responseToApiError(res)
        }
      } catch (err) {
        handleApiError(err, showToast)
      }
    },
    [showToast],
  )

  const undoComplete = useCallback(async () => {
    if (!lastCompleted) return
    const task = lastCompleted
    setLastCompleted(null)
    setTasks((prev) => [...prev, task])
    try {
      const res = await mutate(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: task.status }),
      })
      if (!res.ok) {
        setTasks((prev) => prev.filter((t) => t.id !== task.id))
        throw await responseToApiError(res)
      }
    } catch (err) {
      handleApiError(err, showToast)
    }
  }, [lastCompleted, showToast])

  useKeyboardShortcuts([
    {
      key: 'j',
      handler: () =>
        setFocusedIndex((i) =>
          visible.length === 0 ? null : i === null ? 0 : Math.min(i + 1, visible.length - 1),
        ),
    },
    {
      key: 'k',
      handler: () =>
        setFocusedIndex((i) =>
          visible.length === 0 ? null : i === null ? 0 : Math.max(i - 1, 0),
        ),
    },
    {
      key: 'c',
      handler: () => {
        if (focusedIndex === null || focusedIndex >= visible.length) return
        void completeTask(visible[focusedIndex])
      },
    },
    { key: 'z', meta: true, handler: () => void undoComplete() },
    { key: 'z', ctrl: true, handler: () => void undoComplete() },
  ])

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
          {visible.map((task, i) => (
            <li
              key={task.id}
              aria-current={focusedIndex === i ? 'true' : undefined}
              className={`rounded-lg border px-4 py-3 text-sm text-white ${
                focusedIndex === i
                  ? 'border-blue-500 bg-slate-700'
                  : 'border-slate-700 bg-slate-800'
              }`}
            >
              {task.title}
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
