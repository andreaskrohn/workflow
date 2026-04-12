'use client'

import React, { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { usePathname } from 'next/navigation'
import { z } from 'zod'
import { mutate } from '@/lib/utils/mutate'
import { handleApiError, responseToApiError } from '@/lib/utils/errors'
import { popUndo } from '@/lib/hooks/useUndo'
import { useKeyboardShortcuts } from '@/lib/hooks/useKeyboardShortcuts'
import { useToast } from '@/components/shared/ToastProvider'

// ── Routes mapped to keys 1-8 ─────────────────────────────────────────────────

const NAV_KEYS: Record<string, string> = {
  '1': '/inbox',
  '2': '/now',
  '3': '/today',
  '4': '/graph',
  '5': '/tags',
  '6': '/by-tag',
  '7': '/review',
  '8': '/log',
}

// ── Inbox capture schema ──────────────────────────────────────────────────────

const InboxCaptureSchema = z.object({
  title: z
    .string()
    .min(1, 'Title is required.')
    .max(500, 'Title must not exceed 500 characters.'),
})

// ── Component ─────────────────────────────────────────────────────────────────

export function GlobalShortcuts() {
  const router = useRouter()
  const pathname = usePathname()
  const { showToast } = useToast()

  const [captureOpen, setCaptureOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [titleError, setTitleError] = useState('')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function openCapture() {
    setCaptureOpen(true)
    // Focus is set in the rendered element via autoFocus.
  }

  function closeCapture() {
    setCaptureOpen(false)
    setTitle('')
    setTitleError('')
  }

  async function submitCapture(e: React.FormEvent) {
    e.preventDefault()
    setTitleError('')

    const result = InboxCaptureSchema.safeParse({ title })
    if (!result.success) {
      setTitleError(result.error.issues[0]?.message ?? 'Title is required.')
      return
    }

    setSaving(true)
    try {
      const res = await mutate('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: result.data.title }),
      })
      if (!res.ok) throw await responseToApiError(res)
      closeCapture()
      showToast('Task added to inbox.')
    } catch (err) {
      handleApiError(err, showToast)
    } finally {
      setSaving(false)
    }
  }

  async function triggerUndo() {
    const snapshot = popUndo()
    if (!snapshot) return

    if (snapshot.type === 'task-complete') {
      try {
        const res = await mutate(`/api/tasks/${snapshot.taskId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: snapshot.previousStatus }),
        })
        if (!res.ok) throw await responseToApiError(res)
        showToast('Undone.')
      } catch (err) {
        handleApiError(err, showToast)
      }
    }
  }

  useKeyboardShortcuts([
    // Number keys 1-8 → navigate to the corresponding view.
    ...Object.entries(NAV_KEYS).map(([key, href]) => ({
      key,
      handler: () => router.push(href),
    })),
    // 'n' → inbox quick capture. Skipped on /graph, which has its own capture.
    ...(pathname !== '/graph' ? [{ key: 'n', handler: openCapture }] : []),
    // Cmd+Z / Ctrl+Z → undo (localStorage-based stack).
    { key: 'z', meta: true, handler: triggerUndo },
    { key: 'z', ctrl: true, handler: triggerUndo },
    // Escape → close capture modal.
    { key: 'Escape', guardEditable: false, handler: closeCapture },
  ])

  if (!captureOpen) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="inbox-capture-heading"
      className="fixed inset-0 z-50 flex items-start justify-center pt-32"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={closeCapture} />

      <div className="relative w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
        <h2
          id="inbox-capture-heading"
          className="mb-4 text-sm font-semibold text-white"
        >
          Add to inbox
        </h2>

        <form onSubmit={submitCapture} noValidate>
          <div className="mb-4">
            <label
              htmlFor="inbox-capture-title"
              className="block text-xs text-slate-400 mb-1"
            >
              Title
            </label>
            <input
              id="inbox-capture-title"
              ref={inputRef}
              type="text"
              value={title}
              autoFocus
              onChange={(e) => {
                setTitle(e.target.value)
                if (titleError) setTitleError('')
              }}
              maxLength={500}
              className="w-full rounded bg-slate-800 border border-slate-600 px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
            />
            {titleError && (
              <p className="mt-1 text-xs text-red-400">{titleError}</p>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={closeCapture}
              className="rounded px-3 py-1.5 text-sm text-slate-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
