'use client'

import React, { useState } from 'react'
import { useTagContext } from './TagContext'
import { TagCreateSchema } from '@/lib/validation/tag'

// ── Component ─────────────────────────────────────────────────────────────────

export function TagsPage() {
  const { tags, loading, addTag, removeTag } = useTagContext()

  const [name, setName] = useState('')
  const [nameError, setNameError] = useState('')
  const [creating, setCreating] = useState(false)

  // ── Create ──────────────────────────────────────────────────────────────────

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setNameError('')

    const trimmed = name.trim()

    // Client-side validation — UK English messages from shared schema
    const result = TagCreateSchema.safeParse({ name: trimmed })
    if (!result.success) {
      setNameError(result.error.issues[0]?.message ?? 'Invalid tag name.')
      return
    }

    // Pre-flight duplicate check against the in-memory list
    if (tags.some((t) => t.name === trimmed)) {
      setNameError('A tag with that name already exists.')
      return
    }

    setCreating(true)
    const created = await addTag(trimmed)
    setCreating(false)

    if (created) {
      setName('')
    } else {
      setNameError('Could not create tag. Please try again.')
    }
  }

  // ── Delete ──────────────────────────────────────────────────────────────────

  function handleDelete(id: string) {
    void removeTag(id)
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <main className="p-6 max-w-lg">
      <h1 className="mb-6 text-2xl font-semibold text-white">Tags</h1>

      {/* ── Create form ────────────────────────────────────────────────────── */}
      <form onSubmit={handleCreate} noValidate className="mb-8">
        <div className="flex gap-2">
          <label htmlFor="tag-name-input" className="sr-only">
            Tag name
          </label>
          <input
            id="tag-name-input"
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              if (nameError) setNameError('')
            }}
            placeholder="Tag name"
            aria-label="Tag name"
            aria-describedby={nameError ? 'tag-name-error' : undefined}
            aria-invalid={nameError ? true : undefined}
            maxLength={50}
            className="flex-1 rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={creating}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {creating ? 'Creating…' : 'Create tag'}
          </button>
        </div>
        {nameError && (
          <p id="tag-name-error" role="alert" className="mt-1 text-xs text-red-400">
            {nameError}
          </p>
        )}
      </form>

      {/* ── Tag list ───────────────────────────────────────────────────────── */}
      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : tags.length === 0 ? (
        <p className="text-sm text-slate-400">No tags yet.</p>
      ) : (
        <ul className="space-y-2">
          {tags.map((tag) => (
            <li
              key={tag.id}
              className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-800 px-4 py-2"
            >
              <span className="text-sm text-white">{tag.name}</span>
              <button
                type="button"
                onClick={() => handleDelete(tag.id)}
                aria-label={`Delete ${tag.name}`}
                className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-700 hover:text-red-400"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
