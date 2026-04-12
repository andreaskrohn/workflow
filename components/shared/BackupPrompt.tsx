'use client'
import React, { useEffect, useState } from 'react'
import { mutate } from '@/lib/utils/mutate'

type State = 'idle' | 'visible' | 'backing-up' | 'dismissed'

export function BackupPrompt() {
  const [state, setState] = useState<State>('idle')

  useEffect(() => {
    fetch('/api/backup/status')
      .then((r) => r.json())
      .then((data: { needed: boolean }) => {
        if (data.needed) setState('visible')
      })
      .catch(() => {
        // Status check failure is non-fatal — don't surface anything.
      })
  }, [])

  if (state !== 'visible' && state !== 'backing-up') return null

  async function handleBackUp() {
    setState('backing-up')
    try {
      await mutate('/api/backup', { method: 'POST' })
    } catch {
      // Fire-and-forget; the API itself is non-blocking.
    }
    setState('dismissed')
  }

  return (
    <div
      role="alertdialog"
      aria-label="Backup reminder"
      className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 rounded-xl border border-amber-500/40 bg-slate-900 px-5 py-3 shadow-2xl text-sm"
    >
      <span className="text-amber-300">
        {state === 'backing-up'
          ? 'Backing up…'
          : 'No recent backup found. Back up now?'}
      </span>
      {state === 'visible' && (
        <>
          <button
            onClick={handleBackUp}
            className="rounded bg-amber-600 px-3 py-1 font-semibold text-white hover:bg-amber-500"
          >
            Back up
          </button>
          <button
            onClick={() => setState('dismissed')}
            className="text-slate-400 hover:text-white px-2 py-1"
          >
            Not now
          </button>
        </>
      )}
    </div>
  )
}
