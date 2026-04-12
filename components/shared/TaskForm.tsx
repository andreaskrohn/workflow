'use client'

import React, { useState } from 'react'
import type { Task } from '@/lib/db/repositories/taskRepository'
import { handleApiError, responseToApiError } from '@/lib/utils/errors'
import { mutate } from '@/lib/utils/mutate'
import { useToast } from './ToastProvider'
import { tsToDateInput, dateInputToTs, addDays, addMonths } from '@/lib/utils/dates'

interface TaskFormProps {
  task?: Task
  workflowId?: string
  onSaved: (task: Task) => void
  onArchived?: () => void
  onCancel: () => void
}

export function TaskForm({ task, workflowId, onSaved, onArchived, onCancel }: TaskFormProps) {
  const { showToast } = useToast()
  const isEdit = Boolean(task)

  const [title, setTitle] = useState(task?.title ?? '')
  const [deferDate, setDeferDate] = useState(tsToDateInput(task?.defer_date ?? null))
  const [reviewDate, setReviewDate] = useState(tsToDateInput(task?.review_date ?? null))
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  async function submitPatch(body: Record<string, unknown>) {
    const res = await mutate(`/api/tasks/${task!.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw await responseToApiError(res)
    return (await res.json()) as Task
  }

  async function handleSave(e?: React.FormEvent) {
    e?.preventDefault()
    setSaving(true)
    setFieldErrors({})
    try {
      let saved: Task
      if (isEdit) {
        saved = await submitPatch({
          title,
          defer_date: dateInputToTs(deferDate),
          review_date: dateInputToTs(reviewDate),
        })
      } else {
        const res = await mutate('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, workflow_id: workflowId, defer_date: dateInputToTs(deferDate), review_date: dateInputToTs(reviewDate) }),
        })
        if (!res.ok) throw await responseToApiError(res)
        saved = (await res.json()) as Task
      }
      onSaved(saved)
    } catch (err) {
      const errors = handleApiError(err, showToast)
      setFieldErrors(errors)
    } finally {
      setSaving(false)
    }
  }

  async function handleComplete() {
    setSaving(true)
    setFieldErrors({})
    try {
      const saved = await submitPatch({ status: 'done' })
      onSaved(saved)
    } catch (err) {
      const errors = handleApiError(err, showToast)
      setFieldErrors(errors)
    } finally {
      setSaving(false)
    }
  }

  async function handleArchive() {
    setSaving(true)
    try {
      const res = await mutate(`/api/tasks/${task!.id}/archive`, { method: 'POST' })
      if (!res.ok) throw await responseToApiError(res)
      onArchived?.()
    } catch (err) {
      handleApiError(err, showToast)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSave} noValidate>
      <div>
        <label htmlFor="task-title">Title</label>
        <input
          id="task-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        {fieldErrors.title && <span>{fieldErrors.title}</span>}
      </div>

      <div>
        <label htmlFor="task-defer-date">Defer until</label>
        <input
          id="task-defer-date"
          type="date"
          value={deferDate}
          onChange={(e) => setDeferDate(e.target.value)}
        />
      </div>

      <div>
        <button type="button" onClick={() => setDeferDate(addDays(deferDate || null, 1))}>+1d</button>
        <button type="button" onClick={() => setDeferDate(addDays(deferDate || null, 7))}>+1w</button>
        <button type="button" onClick={() => setDeferDate(addMonths(deferDate || null, 1))}>+1m</button>
        <button type="button" onClick={() => setDeferDate(addMonths(deferDate || null, 3))}>+3m</button>
      </div>

      <div>
        <label htmlFor="task-review-date">Review date</label>
        <input
          id="task-review-date"
          type="date"
          value={reviewDate}
          onChange={(e) => setReviewDate(e.target.value)}
        />
      </div>

      <div>
        <button type="button" onClick={() => setReviewDate(addDays(reviewDate || null, 7))}>+1w</button>
        <button type="button" onClick={() => setReviewDate(addDays(reviewDate || null, 14))}>+2w</button>
        <button type="button" onClick={() => setReviewDate(addMonths(reviewDate || null, 1))}>+1m</button>
        <button type="button" onClick={() => setReviewDate(addMonths(reviewDate || null, 3))}>+3m</button>
      </div>

      <div>
        <button type="submit" disabled={saving}>Save</button>
        <button type="button" onClick={onCancel}>Cancel</button>
        {isEdit && (
          <>
            <button type="button" onClick={handleComplete} disabled={saving}>
              Mark as done
            </button>
            <button type="button" onClick={handleArchive} disabled={saving}>
              Archive
            </button>
          </>
        )}
      </div>
    </form>
  )
}
