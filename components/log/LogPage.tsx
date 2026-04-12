'use client'

import React, { useEffect, useState } from 'react'
import type { Task } from '@/lib/db/repositories/taskRepository'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCompletedAt(ts: number | null): string {
  if (!ts) return '—'
  return new Date(ts * 1000).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

// ── Component ─────────────────────────────────────────────────────────────────

interface LogPageProps {
  /**
   * Debounce delay (ms) before the search API is called after the user stops
   * typing. Pass `0` in tests to disable the delay.
   */
  searchDebounceMs?: number
}

export function LogPage({ searchDebounceMs = 300 }: LogPageProps) {
  const [completed, setCompleted] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Task[] | null>(null)
  const [searching, setSearching] = useState(false)

  // ── Initial load ─────────────────────────────────────────────────────────

  useEffect(() => {
    fetch('/api/tasks/log')
      .then((res) => res.json())
      .then((data: Task[]) => setCompleted(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // ── Search ────────────────────────────────────────────────────────────────

  useEffect(() => {
    const q = searchQuery.trim()

    if (!q) {
      setSearchResults(null)
      setSearching(false)
      return
    }

    setSearching(true)

    const timer = setTimeout(() => {
      fetch(`/api/tasks/search?q=${encodeURIComponent(q)}`)
        .then((res) => res.json())
        .then((data: Task[]) => {
          // The search API returns all non-archived tasks; filter to done only.
          setSearchResults(data.filter((t) => t.status === 'done'))
        })
        .catch(() => { setSearchResults([]) })
        .finally(() => setSearching(false))
    }, searchDebounceMs)

    return () => clearTimeout(timer)
  }, [searchQuery, searchDebounceMs])

  // ── Derived state ─────────────────────────────────────────────────────────

  const visible = searchResults !== null ? searchResults : completed
  const isSearching = searchQuery.trim().length > 0

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <main className="p-6 max-w-2xl">
      <h1 className="mb-1 text-2xl font-semibold text-white">Log</h1>

      {/* ── v2 note ──────────────────────────────────────────────────────── */}
      <p className="mb-6 text-xs text-slate-500">
        Note: completed tasks inside archived workflows or projects are not
        shown here. This will be addressed in a future update.
      </p>

      {/* ── Search ───────────────────────────────────────────────────────── */}
      <input
        type="search"
        aria-label="Search completed tasks"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Search completed tasks…"
        className="mb-6 w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white placeholder-slate-400 focus:border-blue-500 focus:outline-none"
      />

      {/* ── List ─────────────────────────────────────────────────────────── */}
      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : searching ? (
        <p className="text-sm text-slate-400">Searching…</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-slate-400">
          {isSearching ? 'No completed tasks match your search.' : 'No completed tasks yet.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {visible.map((task) => (
            <li
              key={task.id}
              className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-800 px-4 py-3"
            >
              <span className="text-sm text-white">{task.title}</span>
              <span
                className="ml-4 shrink-0 text-xs text-slate-400"
                aria-label={`Completed ${formatCompletedAt(task.completed_at)}`}
              >
                {formatCompletedAt(task.completed_at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
