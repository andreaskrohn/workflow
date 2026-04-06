'use client'
import React, { useEffect, useRef, useState } from 'react'
import type { Project } from '@/lib/db/repositories/projectRepository'
import { getCsrfToken } from '@/lib/middleware/csrf'
import { useToast } from '@/components/shared/ToastProvider'

interface ProjectSwitcherProps {
  projects: Project[]
  selected: Project | null
  onSelect: (project: Project) => void
  onProjectCreated: (project: Project) => void
}

export function ProjectSwitcher({ projects, selected, onSelect, onProjectCreated }: ProjectSwitcherProps) {
  const { showToast } = useToast()
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setCreating(false)
        setNewName('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (creating) setTimeout(() => inputRef.current?.focus(), 0)
  }, [creating])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    setSaving(true)
    try {
      const token = await getCsrfToken()
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
        body: JSON.stringify({ name: newName.trim() }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        showToast((data as { error?: string }).error ?? 'Failed to create project.')
        return
      }
      const project: Project = await res.json()
      onProjectCreated(project)
      setNewName('')
      setCreating(false)
      setOpen(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      ref={ref}
      className="relative flex-shrink-0 border-b border-slate-700 bg-slate-900 px-4 py-2 flex items-center gap-3"
    >
      <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
        Project
      </span>
      <button
        onClick={() => { setOpen((v) => !v); setCreating(false) }}
        className="flex items-center gap-1.5 text-sm font-medium text-white hover:text-blue-400 transition-colors"
      >
        {selected?.name ?? 'Select project'}
        <svg className="w-3 h-3 opacity-60" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-16 mt-1 bg-slate-800 border border-slate-600 rounded shadow-lg z-50 min-w-48">
          {projects.length === 0 && !creating && (
            <p className="px-4 py-2 text-xs text-slate-400">No projects</p>
          )}
          {projects.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                onSelect(p)
                setOpen(false)
              }}
              className={`w-full text-left px-4 py-2 text-sm hover:bg-slate-700 transition-colors ${
                selected?.id === p.id ? 'text-blue-400 font-medium' : 'text-white'
              }`}
            >
              {p.name}
            </button>
          ))}
          <div className="border-t border-slate-700">
            {creating ? (
              <form onSubmit={handleCreate} className="px-3 py-2 flex gap-2">
                <input
                  ref={inputRef}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Project name"
                  maxLength={200}
                  className="flex-1 rounded bg-slate-700 border border-slate-500 px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500 min-w-0"
                  onKeyDown={(e) => { if (e.key === 'Escape') { setCreating(false); setNewName('') } }}
                />
                <button
                  type="submit"
                  disabled={!newName.trim() || saving}
                  className="text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 flex-shrink-0"
                >
                  {saving ? '…' : 'Add'}
                </button>
              </form>
            ) : (
              <button
                onClick={() => setCreating(true)}
                className="w-full text-left px-4 py-2 text-xs text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
              >
                + New project
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
