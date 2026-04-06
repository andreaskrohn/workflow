'use client'
import React, { useRef, useState } from 'react'

export const WORKFLOW_HEADER_NODE_WIDTH = 4000

export interface WorkflowHeaderNodeData {
  workflowId: string
  name: string
  endGoal: string | null
  endGoalDueDate: number | null
  onSaveEndGoal: (workflowId: string, endGoal: string | null) => void
  onSaveName: (workflowId: string, name: string) => void
  onAddTask: (workflowId: string) => void
  onOpenDetail: (workflowId: string) => void
  onArchive: (workflowId: string) => void
  onDelete: (workflowId: string) => void
}

function formatDate(ts: number): string {
  const d = new Date(ts * 1000)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export function WorkflowHeaderNode({ data }: { data: WorkflowHeaderNodeData }) {
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(data.name)
  const [menuOpen, setMenuOpen] = useState(false)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  function startEditingName(e: React.MouseEvent) {
    e.stopPropagation()
    setNameDraft(data.name)
    setEditingName(true)
    setTimeout(() => nameInputRef.current?.select(), 0)
  }

  function handleSaveName() {
    const trimmed = nameDraft.trim()
    setEditingName(false)
    if (trimmed && trimmed !== data.name) {
      data.onSaveName(data.workflowId, trimmed)
    }
  }

  function handleNameKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') handleSaveName()
    if (e.key === 'Escape') setEditingName(false)
  }

  function handleMenuBlur(e: React.FocusEvent) {
    if (!menuRef.current?.contains(e.relatedTarget as Node)) {
      setMenuOpen(false)
    }
  }

  return (
    <div
      style={{ width: WORKFLOW_HEADER_NODE_WIDTH, height: 52 }}
      className="flex items-center gap-3 px-4 bg-slate-800 border-y border-slate-600 select-none"
      onClick={() => data.onOpenDetail(data.workflowId)}
    >
      {/* Workflow name */}
      <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
        <div className="h-px w-6 bg-slate-500" />
        {editingName ? (
          <input
            ref={nameInputRef}
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onKeyDown={handleNameKeyDown}
            onBlur={handleSaveName}
            maxLength={200}
            className="rounded bg-slate-700 border border-blue-500 px-2 py-0.5 text-sm font-semibold text-white focus:outline-none w-40"
          />
        ) : (
          <span
            className="text-sm font-semibold text-white cursor-pointer hover:text-blue-300"
            onDoubleClick={startEditingName}
            title="Double-click to rename"
          >
            {data.name}
          </span>
        )}
        <div className="h-px w-4 bg-slate-500" />
      </div>

      {/* End goal + due date */}
      <div className="flex items-center gap-2 flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
        <span className="text-xs text-slate-400 flex-shrink-0">End goal:</span>
        {data.endGoal ? (
          <span className="text-xs text-purple-300 truncate max-w-md">{data.endGoal}</span>
        ) : (
          <span className="text-xs text-slate-500 italic">Not set</span>
        )}
        {data.endGoal && data.endGoalDueDate && (
          <span className="text-xs text-slate-400 flex-shrink-0 ml-1">
            · Due {formatDate(data.endGoalDueDate)}
          </span>
        )}
      </div>

      {/* Right-side actions */}
      <div className="flex items-center gap-2 ml-auto flex-shrink-0" onClick={(e) => e.stopPropagation()}>
        {/* Add task button */}
        <button
          onClick={(e) => { e.stopPropagation(); data.onAddTask(data.workflowId) }}
          className="rounded bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-500"
        >
          + Task
        </button>

        {/* ⋮ menu */}
        <div ref={menuRef} className="relative" onBlur={handleMenuBlur}>
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen((o) => !o) }}
            className="w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
            title="Workflow options"
          >
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
              <circle cx="8" cy="3" r="1.3" />
              <circle cx="8" cy="8" r="1.3" />
              <circle cx="8" cy="13" r="1.3" />
            </svg>
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-8 z-50 w-40 rounded-lg border border-slate-600 bg-slate-800 shadow-xl py-1">
              <button
                onClick={(e) => { e.stopPropagation(); setMenuOpen(false); data.onArchive(data.workflowId) }}
                className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 hover:text-white"
              >
                Archive workflow
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setMenuOpen(false); data.onDelete(data.workflowId) }}
                className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-slate-700 hover:text-red-300"
              >
                Delete workflow
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
