/** @jest-environment jsdom */
import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import type { Task } from '@/lib/db/repositories/taskRepository'
import { ToastProvider } from '../ToastProvider'
import { QuickCaptureModal } from '../QuickCaptureModal'

// ── Module mocks ──────────────────────────────────────────────────────────────

jest.mock('@/lib/middleware/csrf', () => ({
  getCsrfToken: jest.fn().mockResolvedValue('test-csrf-token'),
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

function ok(data: unknown): Response {
  return { ok: true, status: 201, json: async () => data } as unknown as Response
}

function err(status: number, body: unknown): Response {
  return { ok: false, status, json: async () => body } as unknown as Response
}

function wrap(ui: React.ReactElement) {
  return render(<ToastProvider>{ui}</ToastProvider>)
}

function open() {
  fireEvent.keyDown(document, { key: 'n' })
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const baseTask: Task = {
  id: 'task-1',
  workflow_id: 'wf-1',
  title: 'Captured task',
  description: null,
  notes: null,
  status: 'todo',
  priority: 3,
  due_date: null,
  defer_date: null,
  created_at: 1_000_000,
  updated_at: 1_000_000,
  archived_at: null,
  position_x: 0,
  position_y: 0,
  end_goal: null,
}

let mockFetch: jest.Mock
const onCreated = jest.fn()

beforeEach(() => {
  mockFetch = jest.fn()
  global.fetch = mockFetch
  jest.clearAllMocks()
})

// ── Keyboard shortcut ─────────────────────────────────────────────────────────

it('opens when the "n" key is pressed', () => {
  wrap(<QuickCaptureModal workflowId="wf-1" onCreated={onCreated} />)

  open()

  expect(screen.getByRole('dialog')).toBeInTheDocument()
})

it('does not open when "n" is pressed while an input element is focused', () => {
  wrap(
    <>
      <input data-testid="other-input" />
      <QuickCaptureModal workflowId="wf-1" onCreated={onCreated} />
    </>,
  )

  fireEvent.keyDown(screen.getByTestId('other-input'), { key: 'n' })

  expect(screen.queryByRole('dialog')).toBeNull()
})

it('does not open when "n" is pressed while a textarea is focused', () => {
  wrap(
    <>
      <textarea data-testid="other-textarea" />
      <QuickCaptureModal workflowId="wf-1" onCreated={onCreated} />
    </>,
  )

  fireEvent.keyDown(screen.getByTestId('other-textarea'), { key: 'n' })

  expect(screen.queryByRole('dialog')).toBeNull()
})

// ── Close ─────────────────────────────────────────────────────────────────────

it('closes when Escape is pressed', () => {
  wrap(<QuickCaptureModal workflowId="wf-1" onCreated={onCreated} />)

  open()
  expect(screen.getByRole('dialog')).toBeInTheDocument()

  fireEvent.keyDown(document, { key: 'Escape' })

  expect(screen.queryByRole('dialog')).toBeNull()
})

it('closes when the Cancel button is clicked', () => {
  wrap(<QuickCaptureModal workflowId="wf-1" onCreated={onCreated} />)

  open()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

  expect(screen.queryByRole('dialog')).toBeNull()
})

// ── Zod client-side validation (UK English) ───────────────────────────────────

it('shows "Title is required." and does not fetch when title is empty', async () => {
  wrap(<QuickCaptureModal workflowId="wf-1" onCreated={onCreated} />)

  open()
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  })

  expect(screen.getByText('Title is required.')).toBeInTheDocument()
  expect(mockFetch).not.toHaveBeenCalled()
})

it('shows "Title must not exceed 500 characters." for a title that is too long', async () => {
  wrap(<QuickCaptureModal workflowId="wf-1" onCreated={onCreated} />)

  open()
  fireEvent.change(screen.getByLabelText('Title'), {
    target: { value: 'x'.repeat(501) },
  })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  })

  expect(screen.getByText('Title must not exceed 500 characters.')).toBeInTheDocument()
  expect(mockFetch).not.toHaveBeenCalled()
})

it('clears the validation error when the user starts typing', async () => {
  wrap(<QuickCaptureModal workflowId="wf-1" onCreated={onCreated} />)

  open()
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  })
  expect(screen.getByText('Title is required.')).toBeInTheDocument()

  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'A' } })

  expect(screen.queryByText('Title is required.')).toBeNull()
})

// ── CSRF + POST ───────────────────────────────────────────────────────────────

it('POSTs to /api/tasks with title and workflow_id', async () => {
  mockFetch.mockResolvedValue(ok(baseTask))

  wrap(<QuickCaptureModal workflowId="wf-1" onCreated={onCreated} />)

  open()
  fireEvent.change(screen.getByLabelText('Title'), {
    target: { value: 'Captured task' },
  })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  })

  expect(mockFetch).toHaveBeenCalledWith(
    '/api/tasks',
    expect.objectContaining({ method: 'POST' }),
  )
  const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)
  expect(body.title).toBe('Captured task')
  expect(body.workflow_id).toBe('wf-1')
})

it('includes the CSRF token in the X-CSRF-Token header', async () => {
  mockFetch.mockResolvedValue(ok(baseTask))

  wrap(<QuickCaptureModal workflowId="wf-1" onCreated={onCreated} />)

  open()
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Task' } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  })

  const headers = (mockFetch.mock.calls[0][1] as RequestInit).headers as Record<string, string>
  expect(headers['X-CSRF-Token']).toBe('test-csrf-token')
})

// ── onCreated + reset ─────────────────────────────────────────────────────────

it('calls onCreated with the returned task after a successful save', async () => {
  mockFetch.mockResolvedValue(ok(baseTask))

  wrap(<QuickCaptureModal workflowId="wf-1" onCreated={onCreated} />)

  open()
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Captured task' } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  })

  expect(onCreated).toHaveBeenCalledWith(baseTask)
})

it('closes and resets the title field after a successful save', async () => {
  mockFetch.mockResolvedValue(ok(baseTask))

  wrap(<QuickCaptureModal workflowId="wf-1" onCreated={onCreated} />)

  open()
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Captured task' } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  })

  expect(screen.queryByRole('dialog')).toBeNull()

  // Reopen — title must be empty
  open()
  expect(screen.getByLabelText('Title')).toHaveValue('')
})

it('resets the title field when cancelled', () => {
  wrap(<QuickCaptureModal workflowId="wf-1" onCreated={onCreated} />)

  open()
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Draft' } })
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

  open()
  expect(screen.getByLabelText('Title')).toHaveValue('')
})

// ── handleApiError ────────────────────────────────────────────────────────────

it('displays an inline field error when the API returns 422 with fieldErrors', async () => {
  mockFetch.mockResolvedValue(
    err(422, { error: 'Validation error.', fieldErrors: { title: 'Title is required.' } }),
  )

  wrap(<QuickCaptureModal workflowId="wf-1" onCreated={onCreated} />)

  open()
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'a' } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  })

  expect(screen.getByText('Title is required.')).toBeInTheDocument()
  expect(onCreated).not.toHaveBeenCalled()
})

it('shows a toast and keeps the modal open on a 500 error', async () => {
  mockFetch.mockResolvedValue(err(500, { error: 'Something went wrong.' }))

  wrap(<QuickCaptureModal workflowId="wf-1" onCreated={onCreated} />)

  open()
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Task' } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  })

  await waitFor(() => {
    expect(screen.getByText('Something went wrong.')).toBeInTheDocument()
  })
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  expect(onCreated).not.toHaveBeenCalled()
})
