'use client'

import React, { useEffect, useRef, useState } from 'react'
import type { Task } from '@/lib/db/repositories/taskRepository'

// ── Types ─────────────────────────────────────────────────────────────────────

interface SearchBarProps {
  /** Called when the user selects a result (click or Enter). Optional. */
  onSelect?: (task: Task) => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_CLASSES: Record<string, string> = {
  done: 'bg-green-900 text-green-300',
  blocked: 'bg-red-900 text-red-300',
  todo: 'bg-slate-700 text-slate-300',
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SearchBar({ onSelect }: SearchBarProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Task[]>([])
  const [loading, setLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Open on '/' from anywhere outside an editable element ────────────────

  useEffect(() => {
    function handleGlobalKeyDown(e: KeyboardEvent) {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if ((e.target as HTMLElement).isContentEditable) return
      e.preventDefault()
      setOpen(true)
    }
    document.addEventListener('keydown', handleGlobalKeyDown)
    return () => document.removeEventListener('keydown', handleGlobalKeyDown)
  }, [])

  // ── Focus input on open ───────────────────────────────────────────────────

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  // ── Escape closes ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!open) return
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Helpers ───────────────────────────────────────────────────────────────

  function close() {
    setOpen(false)
    setQuery('')
    setResults([])
    setActiveIndex(-1)
    if (debounceRef.current) clearTimeout(debounceRef.current)
  }

  function handleQueryChange(value: string) {
    setQuery(value)
    setActiveIndex(-1)
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (!value.trim()) {
      setResults([])
      setLoading(false)
      return
    }

    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/tasks/search?q=${encodeURIComponent(value)}`)
        if (res.ok) {
          setResults((await res.json()) as Task[])
        }
      } catch {
        // Silent fail — a search error should not disrupt the user's work.
      } finally {
        setLoading(false)
      }
    }, 300)
  }

  function selectResult(task: Task) {
    onSelect?.(task)
    close()
  }

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => (results.length === 0 ? -1 : (i + 1) % results.length))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => (results.length === 0 ? -1 : i <= 0 ? results.length - 1 : i - 1))
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault()
      const task = results[activeIndex]
      if (task) selectResult(task)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (!open) return null

  const hasResults = results.length > 0
  const showEmpty = !loading && query.trim() !== '' && !hasResults

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Search tasks"
      className="fixed inset-0 z-50 flex items-start justify-center pt-24"
    >
      {/* Backdrop */}
      <div
        data-testid="search-backdrop"
        className="absolute inset-0 bg-black/60"
        aria-hidden="true"
        onClick={close}
      />

      {/* Panel */}
      <div className="relative w-full max-w-xl rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">

        {/* Input row */}
        <div className="flex items-center gap-3 border-b border-slate-700 px-4 py-3">
          <svg
            aria-hidden="true"
            className="h-4 w-4 shrink-0 text-slate-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <circle cx="11" cy="11" r="8" strokeWidth="2" />
            <path d="m21 21-4.35-4.35" strokeWidth="2" strokeLinecap="round" />
          </svg>

          <input
            ref={inputRef}
            id="search-input"
            type="text"
            role="combobox"
            aria-expanded={hasResults}
            aria-controls="search-listbox"
            aria-autocomplete="list"
            aria-activedescendant={
              activeIndex >= 0 ? `search-result-${activeIndex}` : undefined
            }
            aria-label="Search tasks"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="Search tasks…"
            className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none"
          />

          {loading && (
            <span role="status" aria-label="Loading search results">
              <span aria-hidden="true" className="text-xs text-slate-400">…</span>
            </span>
          )}
        </div>

        {/* Results */}
        <ul
          id="search-listbox"
          role="listbox"
          aria-label="Search results"
          aria-busy={loading}
          className="max-h-80 overflow-y-auto py-2"
        >
          {showEmpty && (
            <li role="status" className="px-4 py-3 text-sm text-slate-400">
              No results for &ldquo;{query}&rdquo;
            </li>
          )}

          {results.map((task, index) => (
            <li
              key={task.id}
              id={`search-result-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              onClick={() => selectResult(task)}
              onMouseEnter={() => setActiveIndex(index)}
              className={`flex cursor-pointer items-center gap-3 px-4 py-2.5 ${
                index === activeIndex ? 'bg-slate-700' : 'hover:bg-slate-800'
              }`}
            >
              <span className="flex-1 truncate text-sm text-white">{task.title}</span>
              <span
                className={`rounded px-1.5 py-0.5 text-xs ${STATUS_CLASSES[task.status] ?? STATUS_CLASSES.todo}`}
              >
                {task.status}
              </span>
            </li>
          ))}
        </ul>

        {/* Keyboard hint footer */}
        {hasResults && (
          <div className="flex gap-4 border-t border-slate-700 px-4 py-2 text-xs text-slate-500">
            <span><kbd>↑↓</kbd> Navigate</span>
            <span><kbd>↵</kbd> Select</span>
            <span><kbd>Esc</kbd> Close</span>
          </div>
        )}
      </div>
    </div>
  )
}
