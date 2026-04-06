'use client'
import React, { useState } from 'react'
import type { Workflow } from '@/lib/db/repositories/workflowRepository'

interface WorkflowSelectorProps {
  workflows: Workflow[]
  selected: Workflow | null
  onSelect: (workflow: Workflow) => void
  onCreate: (name: string, endGoal: string | null) => Promise<void>
}

export function WorkflowSelector({ workflows, selected, onSelect, onCreate }: WorkflowSelectorProps) {
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [endGoal, setEndGoal] = useState('')
  const [creating, setCreating] = useState(false)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setCreating(true)
    try {
      await onCreate(name.trim(), endGoal.trim() || null)
      setName('')
      setEndGoal('')
      setShowCreate(false)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="flex-shrink-0 border-b border-slate-700 bg-slate-900 px-4">
      <div className="flex items-center gap-1 overflow-x-auto">
        {workflows.map((w) => (
          <button
            key={w.id}
            onClick={() => onSelect(w)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              selected?.id === w.id
                ? 'border-blue-500 text-white'
                : 'border-transparent text-slate-400 hover:text-white hover:border-slate-500'
            }`}
          >
            {w.name}
          </button>
        ))}
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="px-3 py-2 text-slate-400 hover:text-white text-lg leading-none flex-shrink-0"
          title="New workflow"
        >
          +
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="flex items-center gap-2 py-2 border-t border-slate-700">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Workflow name"
            maxLength={200}
            className="rounded bg-slate-800 border border-slate-600 px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500 w-48"
          />
          <input
            value={endGoal}
            onChange={(e) => setEndGoal(e.target.value)}
            placeholder="End goal (optional)"
            maxLength={2000}
            className="rounded bg-slate-800 border border-slate-600 px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500 flex-1"
          />
          <button
            type="submit"
            disabled={!name.trim() || creating}
            className="rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {creating ? 'Creating…' : 'Create'}
          </button>
          <button
            type="button"
            onClick={() => setShowCreate(false)}
            className="text-slate-400 hover:text-white text-xs px-2 py-1.5"
          >
            Cancel
          </button>
        </form>
      )}
    </div>
  )
}
