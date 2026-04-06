'use client'
import React from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import type { TaskStatus } from '@/lib/db/repositories/taskRepository'

export interface TaskNodeData {
  id: string
  title: string
  description: string | null
  status: TaskStatus
  priority: number
  due_date: number | null
  defer_date: number | null
  isEvaluating: boolean
  isEnabled: boolean
  onToggle: (id: string, newStatus: 'todo' | 'done') => void
  onAddConnected: (sourceId: string) => void
  onAddBefore: (targetId: string) => void
}

type State = 'enabled' | 'completed' | 'deferred' | 'disabled'

function getState(data: TaskNodeData): State {
  if (data.isEvaluating) return 'disabled'
  if (data.status === 'done') return 'completed'
  if (data.status === 'blocked') return 'deferred'
  // Defer date in the future → disabled
  if (data.defer_date != null && data.defer_date > Math.floor(Date.now() / 1000)) return 'disabled'
  if (!data.isEnabled) return 'disabled'
  return 'enabled'
}

const stateStyles: Record<State, string> = {
  enabled: 'border-blue-500 bg-slate-800 text-white',
  completed: 'border-green-500 bg-slate-800 text-green-300 opacity-75',
  deferred: 'border-yellow-500 bg-slate-800 text-yellow-300 opacity-60',
  disabled: 'border-slate-600 bg-slate-900 text-slate-500 opacity-50',
}

const sourceHandleStyle: React.CSSProperties = {
  width: 22,
  height: 22,
  right: -11,
  background: '#2563eb',
  border: '2px solid #bfdbfe',
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'crosshair',
  zIndex: 10,
}

const targetHandleStyle: React.CSSProperties = {
  width: 22,
  height: 22,
  left: -11,
  background: '#475569',
  border: '2px solid #94a3b8',
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'crosshair',
  zIndex: 10,
}

const plusLabel: React.CSSProperties = {
  color: 'white',
  fontSize: 16,
  fontWeight: 'bold',
  lineHeight: 1,
  pointerEvents: 'none',
  userSelect: 'none',
}

function formatDate(ts: number): string {
  const d = new Date(ts * 1000)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export function TaskNode({ data }: NodeProps<TaskNodeData>) {
  const state = getState(data)
  const isDone = data.status === 'done'

  function handleCheckboxClick(e: React.MouseEvent) {
    e.stopPropagation()
    if (data.isEvaluating) return
    data.onToggle(data.id, isDone ? 'todo' : 'done')
  }

  function handleSourceClick(e: React.MouseEvent) {
    e.stopPropagation()
    if (data.isEvaluating) return
    data.onAddConnected(data.id)
  }

  function handleTargetClick(e: React.MouseEvent) {
    e.stopPropagation()
    if (data.isEvaluating) return
    data.onAddBefore(data.id)
  }

  return (
    <div
      data-state={state}
      style={{ pointerEvents: data.isEvaluating ? 'none' : undefined }}
      className={`relative rounded-lg border-2 px-4 py-3 min-w-[180px] max-w-[260px] cursor-pointer select-none ${stateStyles[state]}`}
    >
      <Handle type="target" position={Position.Left} style={targetHandleStyle} onClick={handleTargetClick}>
        <span style={plusLabel}>+</span>
      </Handle>

      <div className="flex items-start gap-2">
        <button
          onClick={handleCheckboxClick}
          style={{ pointerEvents: 'auto' }}
          className={`mt-0.5 flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors ${
            isDone
              ? 'border-green-500 bg-green-500 text-white'
              : 'border-slate-400 bg-transparent'
          }`}
          aria-label={isDone ? 'Mark as to do' : 'Mark as done'}
        >
          {isDone && (
            <svg className="w-2.5 h-2.5" viewBox="0 0 10 10" fill="none">
              <path d="M1.5 5L4 7.5L8.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium leading-snug break-words">{data.title}</p>
          {data.due_date && (
            <p className="text-xs mt-0.5 text-slate-400 leading-tight">
              Due {formatDate(data.due_date)}
            </p>
          )}
          {data.description && (
            <p className="text-xs mt-1 leading-snug break-words opacity-70">
              {data.description.length > 100 ? data.description.slice(0, 100) + '…' : data.description}
            </p>
          )}
        </div>
      </div>

      <Handle type="source" position={Position.Right} style={sourceHandleStyle} onClick={handleSourceClick}>
        <span style={plusLabel}>+</span>
      </Handle>
    </div>
  )
}
