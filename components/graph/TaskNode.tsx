'use client'
import React from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import type { TaskStatus } from '@/lib/db/repositories/taskRepository'

export interface TaskNodeData {
  id: string
  title: string
  status: TaskStatus
  priority: number
  isEvaluating: boolean
}

type State = 'enabled' | 'completed' | 'deferred' | 'disabled'

function getState(data: TaskNodeData): State {
  if (data.isEvaluating) return 'disabled'
  if (data.status === 'done') return 'completed'
  if (data.status === 'blocked') return 'deferred'
  return 'enabled'
}

const stateStyles: Record<State, string> = {
  enabled:
    'border-blue-500 bg-slate-800 text-white',
  completed:
    'border-green-500 bg-slate-800 text-green-300 opacity-75',
  deferred:
    'border-yellow-500 bg-slate-800 text-yellow-300 opacity-60',
  disabled:
    'border-slate-600 bg-slate-900 text-slate-500 opacity-50',
}

export function TaskNode({ data }: NodeProps<TaskNodeData>) {
  const state = getState(data)

  return (
    <div
      data-state={state}
      style={{ pointerEvents: data.isEvaluating ? 'none' : undefined }}
      className={`relative rounded-lg border-2 px-4 py-3 min-w-[180px] max-w-[260px] cursor-pointer select-none ${stateStyles[state]}`}
    >
      <Handle type="target" position={Position.Left} />
      <p className="text-sm font-medium leading-snug break-words">{data.title}</p>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}
