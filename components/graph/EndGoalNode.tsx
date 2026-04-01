'use client'
import React from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'

export interface EndGoalNodeData {
  endGoal: string
}

export function EndGoalNode({ data }: NodeProps<EndGoalNodeData>) {
  return (
    <div className="rounded-xl border-2 border-purple-500 bg-purple-950 px-5 py-3 text-purple-200 text-sm font-semibold shadow-lg min-w-[200px] max-w-[300px]">
      <p className="text-xs uppercase tracking-widest text-purple-400 mb-1">End Goal</p>
      <p className="leading-snug break-words">{data.endGoal}</p>
      <Handle type="target" position={Position.Left} />
    </div>
  )
}
