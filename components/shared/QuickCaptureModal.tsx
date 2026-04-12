'use client'

import React, { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import type { Task } from '@/lib/db/repositories/taskRepository'
import { mutate } from '@/lib/utils/mutate'
import { handleApiError, responseToApiError } from '@/lib/utils/errors'
import { useToast } from './ToastProvider'

// ── Client-side schema ────────────────────────────────────────────────────────

const QuickCaptureSchema = z.object({
  title: z
    .string()
    .min(1, 'Title is required.')
    .max(500, 'Title must not exceed 500 characters.'),
})

// ── Types ─────────────────────────────────────────────────────────────────────

interface QuickCaptureModalProps {
  workflowId: string
  onCreated: (task: Task) => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export function QuickCaptureModal({ workflowId, onCreated }: QuickCaptureModalProps) {
  const { showToast } = useToast()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)

  // Global shortcut: 'n' opens the modal, guarded so it does not fire while
  // the user is typing in another input, textarea, or select.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== 'n' || e.metaKey || e.ctrlKey || e.altKey) return
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if ((e.target as HTMLElement).isContentEditable) return
      e.preventDefault()
      setOpen(true)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Focus the title input whenever the modal opens.
  useEffect(() => {
    if (open) titleRef.current?.focus()
  }, [open])

  // Escape closes the modal while it is open.
  useEffect(() => {
    if (!open) return
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') handleClose()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleClose() {
    setOpen(false)
    setTitle('')
    setFieldErrors({})
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFieldErrors({})

    // Client-side Zod validation — catches errors before hitting the network.
    const result = QuickCaptureSchema.safeParse({ title })
    if (!result.success) {
      const errors: Record<string, string> = {}
      for (const issue of result.error.issues) {
        const key = String(issue.path[0] ?? 'title')
        if (!errors[key]) errors[key] = issue.message
      }
      setFieldErrors(errors)
      return
    }

    setSaving(true)
    try {
      const res = await mutate('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: result.data.title, workflow_id: workflowId }),
      })
      if (!res.ok) throw await responseToApiError(res)
      const task: Task = await res.json()
      onCreated(task)
      handleClose()
    } catch (err) {
      const errors = handleApiError(err, showToast)
      setFieldErrors(errors)
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-capture-heading"
      className="fixed inset-0 z-50 flex items-start justify-center pt-32"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={handleClose} />

      <div className="relative w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
        <h2
          id="quick-capture-heading"
          className="mb-4 text-sm font-semibold text-white"
        >
          Quick capture
        </h2>

        <form onSubmit={handleSubmit} noValidate>
          <div className="mb-4">
            <label
              htmlFor="quick-capture-title"
              className="block text-xs text-slate-400 mb-1"
            >
              Title
            </label>
            <input
              id="quick-capture-title"
              ref={titleRef}
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value)
                if (fieldErrors.title) setFieldErrors((prev) => ({ ...prev, title: '' }))
              }}
              maxLength={500}
              className="w-full rounded bg-slate-800 border border-slate-600 px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
            />
            {fieldErrors.title && (
              <p className="mt-1 text-xs text-red-400">{fieldErrors.title}</p>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={handleClose}
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
