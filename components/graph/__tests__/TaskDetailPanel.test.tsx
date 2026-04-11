/** @jest-environment jsdom */
import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import type { Task } from '@/lib/db/repositories/taskRepository'
import { ToastProvider } from '@/components/shared/ToastProvider'

// ── Module mocks ──────────────────────────────────────────────────────────────

// next/dynamic: return a simple stub so TagManager renders synchronously
jest.mock('next/dynamic', () => (_loader: unknown) => {
  function TagManagerStub({ taskId }: { taskId: string }) {
    return React.createElement('div', { 'data-testid': 'tag-manager', 'data-task-id': taskId })
  }
  return TagManagerStub
})

jest.mock('@/lib/middleware/csrf', () => ({
  getCsrfToken: jest.fn().mockResolvedValue('test-csrf-token'),
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

function ok(data: unknown): Response {
  return { ok: true, status: 200, json: async () => data } as unknown as Response
}

function err(status: number, body: unknown): Response {
  return { ok: false, status, json: async () => body } as unknown as Response
}

function wrap(ui: React.ReactElement) {
  return render(<ToastProvider>{ui}</ToastProvider>)
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

// 2024-06-15 and 2024-06-10 as Unix timestamps (seconds, local midnight)
const DUE_TS = Math.floor(new Date('2024-06-15T00:00:00').getTime() / 1000)
const DEFER_TS = Math.floor(new Date('2024-06-10T00:00:00').getTime() / 1000)

const baseTask: Task = {
  id: 'task-1',
  workflow_id: 'wf-1',
  title: 'My task',
  description: 'Task description',
  notes: 'Task notes',
  status: 'todo',
  priority: 3,
  due_date: DUE_TS,
  defer_date: DEFER_TS,
  created_at: 1_000_000,
  updated_at: 1_000_000,
  archived_at: null,
  position_x: 0,
  position_y: 0,
  end_goal: null,
}

let mockFetch: jest.Mock
const onClose = jest.fn()
const onUpdated = jest.fn()

beforeEach(() => {
  mockFetch = jest.fn()
  global.fetch = mockFetch
  jest.clearAllMocks()
})

// ── Rendering ─────────────────────────────────────────────────────────────────

it('pre-fills all fields from the task prop', () => {
  wrap(<TaskDetailPanel task={baseTask} onClose={onClose} onUpdated={onUpdated} />)

  expect(screen.getByDisplayValue('My task')).toBeInTheDocument()
  expect(screen.getByDisplayValue('To do')).toBeInTheDocument()
  expect(screen.getByDisplayValue('Task description')).toBeInTheDocument()
  expect(screen.getByDisplayValue('Task notes')).toBeInTheDocument()
  expect(screen.getByDisplayValue('2024-06-15')).toBeInTheDocument()
  expect(screen.getByDisplayValue('2024-06-10')).toBeInTheDocument()
})

it('renders TagManager with the task id', () => {
  wrap(<TaskDetailPanel task={baseTask} onClose={onClose} onUpdated={onUpdated} />)

  const tm = screen.getByTestId('tag-manager')
  expect(tm).toBeInTheDocument()
  expect(tm).toHaveAttribute('data-task-id', 'task-1')
})

it('calls onClose when the close button is clicked', () => {
  wrap(<TaskDetailPanel task={baseTask} onClose={onClose} onUpdated={onUpdated} />)

  fireEvent.click(screen.getByRole('button', { name: /close/i }))

  expect(onClose).toHaveBeenCalledTimes(1)
})

// ── Re-sync on task change ─────────────────────────────────────────────────────

it('re-syncs all fields when task.id changes', async () => {
  const { rerender } = wrap(
    <TaskDetailPanel task={baseTask} onClose={onClose} onUpdated={onUpdated} />,
  )

  const newTask: Task = {
    ...baseTask,
    id: 'task-2',
    title: 'Different task',
    description: null,
    notes: null,
    status: 'done',
    due_date: null,
    defer_date: null,
  }
  await act(async () => {
    rerender(
      <ToastProvider>
        <TaskDetailPanel task={newTask} onClose={onClose} onUpdated={onUpdated} />
      </ToastProvider>,
    )
  })

  expect(screen.getByDisplayValue('Different task')).toBeInTheDocument()
  expect(screen.getByDisplayValue('Done')).toBeInTheDocument()
})

// ── Save ──────────────────────────────────────────────────────────────────────

it('PATCHes /api/tasks/:id with the current field values on save', async () => {
  mockFetch.mockResolvedValue(ok({ ...baseTask, title: 'Updated' }))

  wrap(<TaskDetailPanel task={baseTask} onClose={onClose} onUpdated={onUpdated} />)

  fireEvent.change(screen.getByDisplayValue('My task'), { target: { value: 'Updated' } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
  })

  expect(mockFetch).toHaveBeenCalledWith(
    '/api/tasks/task-1',
    expect.objectContaining({ method: 'PATCH' }),
  )
  const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)
  expect(body.title).toBe('Updated')
  expect(body.status).toBe('todo')
  expect(body.description).toBe('Task description')
  expect(body.notes).toBe('Task notes')
})

it('calls onUpdated with the returned task after a successful save', async () => {
  const updated = { ...baseTask, title: 'Updated' }
  mockFetch.mockResolvedValue(ok(updated))

  wrap(<TaskDetailPanel task={baseTask} onClose={onClose} onUpdated={onUpdated} />)

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
  })

  expect(onUpdated).toHaveBeenCalledWith(updated)
})

it('shows a toast and does not call onUpdated on a 500 error', async () => {
  mockFetch.mockResolvedValue(err(500, { error: 'Internal server error.' }))

  wrap(<TaskDetailPanel task={baseTask} onClose={onClose} onUpdated={onUpdated} />)

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
  })

  await waitFor(() => {
    expect(screen.getByText('Internal server error.')).toBeInTheDocument()
  })
  expect(onUpdated).not.toHaveBeenCalled()
})

// ── Due date shortcuts ─────────────────────────────────────────────────────────

describe('due date shortcuts', () => {
  it('+1d adds one day to the existing due date', () => {
    wrap(<TaskDetailPanel task={baseTask} onClose={onClose} onUpdated={onUpdated} />)

    const buttons = screen.getAllByRole('button', { name: '+1d' })
    fireEvent.click(buttons[0]) // first set belongs to due date

    expect(screen.getByDisplayValue('2024-06-16')).toBeInTheDocument()
  })

  it('+1w adds seven days to the existing due date', () => {
    wrap(<TaskDetailPanel task={baseTask} onClose={onClose} onUpdated={onUpdated} />)

    const buttons = screen.getAllByRole('button', { name: '+1w' })
    fireEvent.click(buttons[0])

    expect(screen.getByDisplayValue('2024-06-22')).toBeInTheDocument()
  })

  it('Clear removes the due date', () => {
    wrap(<TaskDetailPanel task={baseTask} onClose={onClose} onUpdated={onUpdated} />)

    const clearButtons = screen.getAllByRole('button', { name: /clear/i })
    fireEvent.click(clearButtons[0]) // first Clear = due date

    expect(screen.queryByDisplayValue('2024-06-15')).toBeNull()
  })
})

// ── Defer date shortcuts ───────────────────────────────────────────────────────

describe('defer date shortcuts', () => {
  it('+1w adds seven days to the existing defer date', () => {
    wrap(<TaskDetailPanel task={baseTask} onClose={onClose} onUpdated={onUpdated} />)

    const buttons = screen.getAllByRole('button', { name: '+1w' })
    fireEvent.click(buttons[1]) // second set belongs to defer date

    expect(screen.getByDisplayValue('2024-06-17')).toBeInTheDocument()
  })

  it('+1m adds one month to the existing defer date', () => {
    wrap(<TaskDetailPanel task={baseTask} onClose={onClose} onUpdated={onUpdated} />)

    const buttons = screen.getAllByRole('button', { name: '+1m' })
    fireEvent.click(buttons[1])

    expect(screen.getByDisplayValue('2024-07-10')).toBeInTheDocument()
  })

  it('Clear removes the defer date', () => {
    wrap(<TaskDetailPanel task={baseTask} onClose={onClose} onUpdated={onUpdated} />)

    const clearButtons = screen.getAllByRole('button', { name: /clear/i })
    fireEvent.click(clearButtons[1]) // second Clear = defer date

    expect(screen.queryByDisplayValue('2024-06-10')).toBeNull()
  })
})

// ── Lazy import to avoid circular refs ───────────────────────────────────────
import { TaskDetailPanel } from '../TaskDetailPanel'
