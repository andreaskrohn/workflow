/** @jest-environment jsdom */
import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import type { Task } from '@/lib/db/repositories/taskRepository'
import { ToastProvider } from '../ToastProvider'
import { TaskForm } from '../TaskForm'

// ── Module mocks ──────────────────────────────────────────────────────────────

jest.mock('@/lib/middleware/csrf', () => ({
  getCsrfToken: jest.fn().mockResolvedValue('test-csrf-token'),
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

function ok(data: unknown, status = 200): Response {
  return { ok: true, status, json: async () => data } as unknown as Response
}

function err(status: number, body: unknown): Response {
  return { ok: false, status, json: async () => body } as unknown as Response
}

function wrap(ui: React.ReactElement) {
  return render(<ToastProvider>{ui}</ToastProvider>)
}

const baseTask: Task = {
  id: 'task-1',
  workflow_id: 'wf-1',
  title: 'Existing task',
  description: null,
  notes: null,
  status: 'todo',
  priority: 3,
  due_date: null,
  defer_date: null,
  review_date: null,
  created_at: 1_000_000,
  updated_at: 1_000_000,
  archived_at: null,
  position_x: 0,
  position_y: 0,
  end_goal: null,
}

let mockFetch: jest.Mock
const onSaved = jest.fn()
const onArchived = jest.fn()
const onCancel = jest.fn()

beforeEach(() => {
  mockFetch = jest.fn()
  global.fetch = mockFetch
  jest.clearAllMocks()
})

// ── Create mode ───────────────────────────────────────────────────────────────

describe('create mode', () => {
  it('renders an empty title input and no archive or complete buttons', () => {
    wrap(<TaskForm workflowId="wf-1" onSaved={onSaved} onCancel={onCancel} />)

    expect(screen.getByLabelText('Title')).toHaveValue('')
    expect(screen.queryByRole('button', { name: /archive/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /mark as done/i })).toBeNull()
  })

  it('POSTs to /api/tasks with workflow_id and title', async () => {
    mockFetch.mockResolvedValue(ok({ ...baseTask, id: 'new-1', title: 'Brand new task' }))

    wrap(<TaskForm workflowId="wf-1" onSaved={onSaved} onCancel={onCancel} />)

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Brand new task' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })) })

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/tasks',
      expect.objectContaining({ method: 'POST' }),
    )
    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)
    expect(body.title).toBe('Brand new task')
    expect(body.workflow_id).toBe('wf-1')
  })

  it('calls onSaved with the returned task after a successful POST', async () => {
    const created = { ...baseTask, id: 'new-1', title: 'Brand new task' }
    mockFetch.mockResolvedValue(ok(created))

    wrap(<TaskForm workflowId="wf-1" onSaved={onSaved} onCancel={onCancel} />)

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Brand new task' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })) })

    expect(onSaved).toHaveBeenCalledWith(created)
  })
})

// ── Edit mode ─────────────────────────────────────────────────────────────────

describe('edit mode', () => {
  it('pre-fills the title input from the task prop', () => {
    wrap(<TaskForm task={baseTask} onSaved={onSaved} onCancel={onCancel} />)
    expect(screen.getByLabelText('Title')).toHaveValue('Existing task')
  })

  it('PATCHes /api/tasks/:id on save', async () => {
    mockFetch.mockResolvedValue(ok({ ...baseTask, title: 'Updated' }))

    wrap(<TaskForm task={baseTask} onSaved={onSaved} onCancel={onCancel} />)

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Updated' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })) })

    expect(mockFetch).toHaveBeenCalledWith(
      `/api/tasks/${baseTask.id}`,
      expect.objectContaining({ method: 'PATCH' }),
    )
  })

  it('shows Archive and Mark as done buttons', () => {
    wrap(
      <TaskForm task={baseTask} onSaved={onSaved} onArchived={onArchived} onCancel={onCancel} />,
    )
    expect(screen.getByRole('button', { name: /mark as done/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /archive/i })).toBeInTheDocument()
  })
})

// ── Complete ──────────────────────────────────────────────────────────────────

it('submits PATCH with status "done" when Mark as done is clicked', async () => {
  mockFetch.mockResolvedValue(ok({ ...baseTask, status: 'done' }))

  wrap(<TaskForm task={baseTask} onSaved={onSaved} onCancel={onCancel} />)

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /mark as done/i }))
  })

  const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)
  expect(body.status).toBe('done')
})

// ── Archive ───────────────────────────────────────────────────────────────────

it('POSTs to /api/tasks/:id/archive and calls onArchived when Archive is clicked', async () => {
  mockFetch.mockResolvedValue(ok(null, 200))

  wrap(
    <TaskForm task={baseTask} onSaved={onSaved} onArchived={onArchived} onCancel={onCancel} />,
  )

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /archive/i }))
  })

  expect(mockFetch).toHaveBeenCalledWith(
    `/api/tasks/${baseTask.id}/archive`,
    expect.objectContaining({ method: 'POST' }),
  )
  expect(onArchived).toHaveBeenCalledTimes(1)
})

// ── Defer date shortcuts ──────────────────────────────────────────────────────

describe('defer date shortcuts', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2024-06-15T12:00:00'))
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('+1d from an empty field uses today as base', () => {
    wrap(<TaskForm task={baseTask} onSaved={onSaved} onCancel={onCancel} />)

    fireEvent.click(screen.getByRole('button', { name: '+1d' }))

    expect(screen.getByLabelText('Defer until')).toHaveValue('2024-06-16')
  })

  it('+1w from an existing date adds 7 days', () => {
    const task = { ...baseTask, defer_date: Math.floor(new Date('2024-06-10T00:00:00').getTime() / 1000) }
    wrap(<TaskForm task={task} onSaved={onSaved} onCancel={onCancel} />)

    // defer +1w is index 0; review +1w is index 1
    fireEvent.click(screen.getAllByRole('button', { name: '+1w' })[0])

    expect(screen.getByLabelText('Defer until')).toHaveValue('2024-06-17')
  })

  it('+1m from an existing date adds one month', () => {
    const task = { ...baseTask, defer_date: Math.floor(new Date('2024-06-10T00:00:00').getTime() / 1000) }
    wrap(<TaskForm task={task} onSaved={onSaved} onCancel={onCancel} />)

    // defer +1m is index 0; review +1m is index 1
    fireEvent.click(screen.getAllByRole('button', { name: '+1m' })[0])

    expect(screen.getByLabelText('Defer until')).toHaveValue('2024-07-10')
  })

  it('+3m from an existing date adds three months', () => {
    const task = { ...baseTask, defer_date: Math.floor(new Date('2024-06-10T00:00:00').getTime() / 1000) }
    wrap(<TaskForm task={task} onSaved={onSaved} onCancel={onCancel} />)

    // defer +3m is index 0; review +3m is index 1
    fireEvent.click(screen.getAllByRole('button', { name: '+3m' })[0])

    expect(screen.getByLabelText('Defer until')).toHaveValue('2024-09-10')
  })

  it('typing a date directly into the date picker updates the defer field', () => {
    wrap(<TaskForm task={baseTask} onSaved={onSaved} onCancel={onCancel} />)

    fireEvent.change(screen.getByLabelText('Defer until'), {
      target: { value: '2024-08-01' },
    })

    expect(screen.getByLabelText('Defer until')).toHaveValue('2024-08-01')
  })
})

// ── Review date shortcuts ─────────────────────────────────────────────────────

describe('review date shortcuts', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2024-06-15T12:00:00'))
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('+1w from an empty field uses today as base', () => {
    wrap(<TaskForm task={baseTask} onSaved={onSaved} onCancel={onCancel} />)

    fireEvent.click(screen.getAllByRole('button', { name: '+1w' })[1]) // [0] = defer +1w, [1] = review +1w

    expect(screen.getByLabelText('Review date')).toHaveValue('2024-06-22')
  })

  it('+2w from an existing date adds 14 days', () => {
    const task = { ...baseTask, review_date: Math.floor(new Date('2024-06-10T00:00:00').getTime() / 1000) }
    wrap(<TaskForm task={task} onSaved={onSaved} onCancel={onCancel} />)

    fireEvent.click(screen.getByRole('button', { name: '+2w' }))

    expect(screen.getByLabelText('Review date')).toHaveValue('2024-06-24')
  })

  it('+1m from an existing date adds one month', () => {
    const task = { ...baseTask, review_date: Math.floor(new Date('2024-06-10T00:00:00').getTime() / 1000) }
    wrap(<TaskForm task={task} onSaved={onSaved} onCancel={onCancel} />)

    fireEvent.click(screen.getAllByRole('button', { name: '+1m' })[1]) // [0] = defer +1m, [1] = review +1m

    expect(screen.getByLabelText('Review date')).toHaveValue('2024-07-10')
  })

  it('+3m from an existing date adds three months', () => {
    const task = { ...baseTask, review_date: Math.floor(new Date('2024-06-10T00:00:00').getTime() / 1000) }
    wrap(<TaskForm task={task} onSaved={onSaved} onCancel={onCancel} />)

    fireEvent.click(screen.getAllByRole('button', { name: '+3m' })[1]) // [0] = defer +3m, [1] = review +3m

    expect(screen.getByLabelText('Review date')).toHaveValue('2024-09-10')
  })

  it('typing a date directly into the date picker updates the review field', () => {
    wrap(<TaskForm task={baseTask} onSaved={onSaved} onCancel={onCancel} />)

    fireEvent.change(screen.getByLabelText('Review date'), { target: { value: '2024-09-01' } })

    expect(screen.getByLabelText('Review date')).toHaveValue('2024-09-01')
  })
})

// ── review_date sent in POST/PATCH ────────────────────────────────────────────

it('includes review_date in the POST body on create', async () => {
  mockFetch.mockResolvedValue(ok({ ...baseTask, id: 'new-1' }))

  wrap(<TaskForm workflowId="wf-1" onSaved={onSaved} onCancel={onCancel} />)

  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'New task' } })
  fireEvent.change(screen.getByLabelText('Review date'), { target: { value: '2024-08-01' } })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })) })

  const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)
  expect(body.review_date).not.toBeNull()
})

it('includes review_date in the PATCH body on edit', async () => {
  mockFetch.mockResolvedValue(ok({ ...baseTask }))

  wrap(<TaskForm task={baseTask} onSaved={onSaved} onCancel={onCancel} />)

  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })) })

  const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)
  expect('review_date' in body).toBe(true)
})

// ── Error handling ────────────────────────────────────────────────────────────

describe('handleApiError', () => {
  it('displays inline field error when API returns 422 with fieldErrors', async () => {
    mockFetch.mockResolvedValue(
      err(422, { error: 'Validation error.', fieldErrors: { title: 'Title is required.' } }),
    )

    wrap(<TaskForm workflowId="wf-1" onSaved={onSaved} onCancel={onCancel} />)

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })) })

    expect(screen.getByText('Title is required.')).toBeInTheDocument()
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('shows a toast and no inline error when API returns a 500', async () => {
    mockFetch.mockResolvedValue(err(500, { error: 'Something went wrong.' }))

    wrap(<TaskForm workflowId="wf-1" onSaved={onSaved} onCancel={onCancel} />)

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })) })

    await waitFor(() => {
      expect(screen.getByText('Something went wrong.')).toBeInTheDocument()
    })
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
