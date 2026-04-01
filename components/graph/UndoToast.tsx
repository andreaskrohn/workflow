'use client'
import React, { useEffect, useState } from 'react'

interface UndoToastProps {
  message: string
  onUndo: () => void
  onDismiss: () => void
  /** Countdown duration in ms. Defaults to 5000. */
  duration?: number
}

export function UndoToast({ message, onUndo, onDismiss, duration = 5000 }: UndoToastProps) {
  const [remaining, setRemaining] = useState(Math.ceil(duration / 1000))

  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(interval)
          onDismiss()
          return 0
        }
        return r - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [duration, onDismiss])

  return (
    <div
      role="status"
      className="flex items-center gap-3 rounded-lg border border-slate-600 bg-slate-800 px-4 py-3 text-sm text-white shadow-xl"
    >
      <span className="flex-1">{message}</span>
      <span className="text-slate-400 tabular-nums">{remaining}s</span>
      <button
        onClick={onUndo}
        className="rounded bg-blue-600 px-3 py-1 text-xs font-semibold hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400"
      >
        Undo
      </button>
    </div>
  )
}
