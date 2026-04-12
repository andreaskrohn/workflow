'use client'

import React, { useEffect, useState } from 'react'
import type { Task } from '@/lib/db/repositories/taskRepository'
import { useTagContext } from './TagContext'
import { tsToDateInput } from '@/lib/utils/dates'

// ── Component ─────────────────────────────────────────────────────────────────

export function TagViewPage() {
  const { tags, loading: tagsLoading } = useTagContext()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [tasks, setTasks] = useState<Task[]>([])
  const [tasksLoading, setTasksLoading] = useState(false)

  // ── Fetch tasks whenever selection changes ────────────────────────────────

  useEffect(() => {
    if (selectedIds.size === 0) {
      setTasks([])
      return
    }

    setTasksLoading(true)
    const param = [...selectedIds].join(',')

    fetch(`/api/tasks/by-tag?tags=${param}`)
      .then((res) => res.json())
      .then((data: Task[]) => setTasks(data))
      .catch(() => {})
      .finally(() => setTasksLoading(false))
  }, [selectedIds])

  // ── Toggle a tag in/out of the selection ──────────────────────────────────

  function toggleTag(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <main className="p-6 max-w-2xl">
      <h1 className="mb-6 text-2xl font-semibold text-white">Tasks by Tag</h1>

      {/* ── Tag selector ───────────────────────────────────────────────── */}
      {tagsLoading ? (
        <p className="mb-4 text-sm text-slate-400">Loading tags…</p>
      ) : tags.length === 0 ? (
        <p className="mb-4 text-sm text-slate-400">No tags yet.</p>
      ) : (
        <div className="mb-6 flex flex-wrap gap-2" role="group" aria-label="Filter by tag">
          {tags.map((tag) => {
            const selected = selectedIds.has(tag.id)
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => toggleTag(tag.id)}
                aria-pressed={selected}
                className={
                  selected
                    ? 'rounded-full bg-blue-600 px-3 py-1 text-xs font-medium text-white'
                    : 'rounded-full border border-slate-600 px-3 py-1 text-xs text-slate-300 hover:border-slate-400 hover:text-white'
                }
              >
                {tag.name}
              </button>
            )
          })}
        </div>
      )}

      {/* ── Task list ──────────────────────────────────────────────────── */}
      {selectedIds.size === 0 ? (
        <p className="text-sm text-slate-400">Select one or more tags to filter tasks.</p>
      ) : tasksLoading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : tasks.length === 0 ? (
        <p className="text-sm text-slate-400">No enabled tasks for the selected tags.</p>
      ) : (
        <ul className="space-y-2">
          {tasks.map((task) => (
            <li
              key={task.id}
              className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-800 px-4 py-3"
            >
              <span className="text-sm text-white">{task.title}</span>
              {task.due_date !== null && (
                <span className="ml-4 shrink-0 text-xs text-slate-400">
                  {tsToDateInput(task.due_date)}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
