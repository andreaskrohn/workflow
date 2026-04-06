'use client'
import React from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'

export interface EndGoalNodeData {
  endGoal: string
  dueDate: number | null
  onAddTask: () => void
  onOpenDetail: () => void
}

function formatDate(ts: number): string {
  const d = new Date(ts * 1000)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export function EndGoalNode({ data }: NodeProps<EndGoalNodeData>) {
  return (
    <div className="relative rounded-xl border-2 border-purple-500 bg-purple-950 px-5 py-3 text-purple-200 text-sm font-semibold shadow-lg min-w-[200px] max-w-[300px]">
      {/* Plus button — add a task before the end goal */}
      <button
        onClick={(e) => { e.stopPropagation(); data.onAddTask() }}
        title="Add task before end goal"
        className="absolute -left-4 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-blue-600 border-2 border-blue-300 flex items-center justify-center text-white text-base font-bold hover:bg-blue-500 z-10"
        style={{ lineHeight: 1 }}
      >
        +
      </button>

      {/* Body — click to open workflow detail */}
      <div onClick={(e) => { e.stopPropagation(); data.onOpenDetail() }} className="cursor-pointer hover:opacity-80 transition-opacity">
        <p className="text-xs uppercase tracking-widest text-purple-400 mb-1">End Goal</p>
        <p className="leading-snug break-words">{data.endGoal}</p>
        {data.dueDate && (
          <p className="text-xs text-purple-400 mt-1.5">Due {formatDate(data.dueDate)}</p>
        )}
      </div>

      <Handle type="target" position={Position.Left} />
    </div>
  )
}
