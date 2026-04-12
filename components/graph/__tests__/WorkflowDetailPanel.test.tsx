/** @jest-environment jsdom */
import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import type { Workflow } from '@/lib/db/repositories/workflowRepository'
import { ToastProvider } from '@/components/shared/ToastProvider'

// ── Module mocks ──────────────────────────────────────────────────────────────

jest.mock('marked', () => ({
  marked: { parse: jest.fn((text: string) => `<p>${text}</p>`) },
}))

jest.mock('@/lib/middleware/csrf', () => ({
  getCsrfToken: jest.fn().mockResolvedValue('test-csrf-token'),
  invalidateCsrfToken: jest.fn().mockResolvedValue('test-csrf-token'),
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

// 2026-03-01 and 2026-03-15 as Unix timestamps (seconds, UTC midnight)
const DUE_TS = Math.floor(new Date('2026-03-01T00:00:00').getTime() / 1000)
const REVIEW_TS = Math.floor(new Date('2026-03-15T00:00:00').getTime() / 1000)

const baseWorkflow: Workflow = {
  id: 'wf-1',
  project_id: 'proj-1',
  name: 'My Workflow',
  end_goal: 'Ship the feature.',
  due_date: DUE_TS,
  review_date: REVIEW_TS,
  sort_order: 0,
  archived_at: null,
  eg_position_x: null,
  eg_position_y: null,
  created_at: 1_000_000,
  updated_at: 1_000_000,
}

let mockFetch: jest.Mock
const onClose = jest.fn()
const onUpdated = jest.fn()

beforeEach(() => {
  mockFetch = jest.fn()
  global.fetch = mockFetch
  jest.clearAllMocks()
})

// ── Lazy import (avoids circular refs in ts-jest) ─────────────────────────────
import { WorkflowDetailPanel } from '../WorkflowDetailPanel'

// ── Rendering ─────────────────────────────────────────────────────────────────

it('pre-fills all fields from the workflow prop', () => {
  wrap(<WorkflowDetailPanel workflow={baseWorkflow} onClose={onClose} onUpdated={onUpdated} />)

  expect(screen.getByLabelText('Name')).toHaveValue('My Workflow')
  expect(screen.getByLabelText('End goal')).toHaveValue('Ship the feature.')
  expect(screen.getByLabelText('Due date')).toHaveValue('2026-03-01')
  expect(screen.getByLabelText('Review date')).toHaveValue('2026-03-15')
})

it('calls onClose when the close button is clicked', () => {
  wrap(<WorkflowDetailPanel workflow={baseWorkflow} onClose={onClose} onUpdated={onUpdated} />)

  fireEvent.click(screen.getByRole('button', { name: /close/i }))

  expect(onClose).toHaveBeenCalledTimes(1)
})

// ── Re-sync on workflow change ────────────────────────────────────────────────

it('re-syncs all fields when workflow.id changes', async () => {
  const { rerender } = wrap(
    <WorkflowDetailPanel workflow={baseWorkflow} onClose={onClose} onUpdated={onUpdated} />,
  )

  const newWorkflow: Workflow = {
    ...baseWorkflow,
    id: 'wf-2',
    name: 'Second Workflow',
    end_goal: null,
    due_date: null,
    review_date: null,
  }
  await act(async () => {
    rerender(
      <ToastProvider>
        <WorkflowDetailPanel workflow={newWorkflow} onClose={onClose} onUpdated={onUpdated} />
      </ToastProvider>,
    )
  })

  expect(screen.getByLabelText('Name')).toHaveValue('Second Workflow')
  expect(screen.getByLabelText('End goal')).toHaveValue('')
  expect(screen.getByLabelText('Review date')).toHaveValue('')
})

// ── End goal markdown preview ─────────────────────────────────────────────────

describe('end goal markdown preview', () => {
  it('shows the textarea on the Write tab', () => {
    wrap(<WorkflowDetailPanel workflow={baseWorkflow} onClose={onClose} onUpdated={onUpdated} />)

    expect(screen.getByLabelText('End goal')).toBeInTheDocument()
    expect(screen.queryByTestId('end-goal-preview')).toBeNull()
  })

  it('shows the preview pane and hides the textarea when Preview is clicked', async () => {
    wrap(<WorkflowDetailPanel workflow={baseWorkflow} onClose={onClose} onUpdated={onUpdated} />)

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Preview' })) })

    expect(screen.queryByLabelText('End goal')).toBeNull()
    expect(screen.getByTestId('end-goal-preview')).toBeInTheDocument()
  })

  it('renders markdown content in the preview pane', async () => {
    const workflow = { ...baseWorkflow, end_goal: 'My end goal text' }
    wrap(<WorkflowDetailPanel workflow={workflow} onClose={onClose} onUpdated={onUpdated} />)

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Preview' })) })

    expect(screen.getByTestId('end-goal-preview').innerHTML).toContain('My end goal text')
  })

  it('switching back to Write tab restores the textarea', async () => {
    wrap(<WorkflowDetailPanel workflow={baseWorkflow} onClose={onClose} onUpdated={onUpdated} />)

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Preview' })) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Write' })) })

    expect(screen.getByLabelText('End goal')).toBeInTheDocument()
    expect(screen.queryByTestId('end-goal-preview')).toBeNull()
  })

  it('preview reflects text typed in the Write tab', async () => {
    const workflow = { ...baseWorkflow, end_goal: '' }
    wrap(<WorkflowDetailPanel workflow={workflow} onClose={onClose} onUpdated={onUpdated} />)

    fireEvent.change(screen.getByLabelText('End goal'), { target: { value: 'New goal' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Preview' })) })

    expect(screen.getByTestId('end-goal-preview').innerHTML).toContain('New goal')
  })
})

// ── Review date shortcuts ─────────────────────────────────────────────────────

describe('review date shortcuts', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-04-01T12:00:00'))
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('+1w from an empty field uses today as base', () => {
    const workflow = { ...baseWorkflow, review_date: null }
    wrap(<WorkflowDetailPanel workflow={workflow} onClose={onClose} onUpdated={onUpdated} />)

    fireEvent.click(screen.getByRole('button', { name: '+1w' }))

    expect(screen.getByLabelText('Review date')).toHaveValue('2026-04-08')
  })

  it('+2w from an empty field uses today as base', () => {
    const workflow = { ...baseWorkflow, review_date: null }
    wrap(<WorkflowDetailPanel workflow={workflow} onClose={onClose} onUpdated={onUpdated} />)

    fireEvent.click(screen.getByRole('button', { name: '+2w' }))

    expect(screen.getByLabelText('Review date')).toHaveValue('2026-04-15')
  })

  it('+1m from an existing date adds one month', () => {
    const ts = Math.floor(new Date('2026-04-01T00:00:00').getTime() / 1000)
    const workflow = { ...baseWorkflow, review_date: ts }
    wrap(<WorkflowDetailPanel workflow={workflow} onClose={onClose} onUpdated={onUpdated} />)

    fireEvent.click(screen.getByRole('button', { name: '+1m' }))

    expect(screen.getByLabelText('Review date')).toHaveValue('2026-05-01')
  })

  it('+3m from an existing date adds three months', () => {
    const ts = Math.floor(new Date('2026-04-01T00:00:00').getTime() / 1000)
    const workflow = { ...baseWorkflow, review_date: ts }
    wrap(<WorkflowDetailPanel workflow={workflow} onClose={onClose} onUpdated={onUpdated} />)

    fireEvent.click(screen.getByRole('button', { name: '+3m' }))

    expect(screen.getByLabelText('Review date')).toHaveValue('2026-07-01')
  })

  it('typing directly into the date picker updates the review date', () => {
    wrap(<WorkflowDetailPanel workflow={baseWorkflow} onClose={onClose} onUpdated={onUpdated} />)

    fireEvent.change(screen.getByLabelText('Review date'), { target: { value: '2026-06-30' } })

    expect(screen.getByLabelText('Review date')).toHaveValue('2026-06-30')
  })

  it('Clear removes the review date', () => {
    wrap(<WorkflowDetailPanel workflow={baseWorkflow} onClose={onClose} onUpdated={onUpdated} />)

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))

    expect(screen.getByLabelText('Review date')).toHaveValue('')
  })
})

// ── Save ──────────────────────────────────────────────────────────────────────

describe('save', () => {
  it('PATCHes /api/workflows/:id with all field values', async () => {
    mockFetch.mockResolvedValue(ok({ ...baseWorkflow }))

    wrap(<WorkflowDetailPanel workflow={baseWorkflow} onClose={onClose} onUpdated={onUpdated} />)

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })) })

    expect(mockFetch).toHaveBeenCalledWith(
      `/api/workflows/${baseWorkflow.id}`,
      expect.objectContaining({ method: 'PATCH' }),
    )
    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)
    expect(body.name).toBe('My Workflow')
    expect(body.end_goal).toBe('Ship the feature.')
    expect(typeof body.review_date).toBe('number')
  })

  it('calls onUpdated with the returned workflow after a successful save', async () => {
    const updated = { ...baseWorkflow, name: 'Renamed' }
    mockFetch.mockResolvedValue(ok(updated))

    wrap(<WorkflowDetailPanel workflow={baseWorkflow} onClose={onClose} onUpdated={onUpdated} />)

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })) })

    expect(onUpdated).toHaveBeenCalledWith(updated)
  })

  it('sends review_date as null when the field is cleared', async () => {
    mockFetch.mockResolvedValue(ok(baseWorkflow))

    const workflow = { ...baseWorkflow, review_date: null }
    wrap(<WorkflowDetailPanel workflow={workflow} onClose={onClose} onUpdated={onUpdated} />)

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })) })

    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)
    expect(body.review_date).toBeNull()
  })

  it('sends end_goal as null when the field is empty', async () => {
    mockFetch.mockResolvedValue(ok(baseWorkflow))

    const workflow = { ...baseWorkflow, end_goal: null }
    wrap(<WorkflowDetailPanel workflow={workflow} onClose={onClose} onUpdated={onUpdated} />)

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })) })

    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)
    expect(body.end_goal).toBeNull()
  })
})

// ── handleApiError ────────────────────────────────────────────────────────────

describe('handleApiError', () => {
  it('shows a toast when the API returns a 500', async () => {
    mockFetch.mockResolvedValue(err(500, { error: 'Internal server error.' }))

    wrap(<WorkflowDetailPanel workflow={baseWorkflow} onClose={onClose} onUpdated={onUpdated} />)

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })) })

    await waitFor(() => {
      expect(screen.getByText('Internal server error.')).toBeInTheDocument()
    })
    expect(onUpdated).not.toHaveBeenCalled()
  })

  it('shows a toast when the API returns a 422 validation error', async () => {
    mockFetch.mockResolvedValue(err(422, { error: 'Name is required.' }))

    wrap(<WorkflowDetailPanel workflow={baseWorkflow} onClose={onClose} onUpdated={onUpdated} />)

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })) })

    await waitFor(() => {
      expect(screen.getByText('Name is required.')).toBeInTheDocument()
    })
  })

  it('shows a client-side toast when name is blank, without making a fetch call', async () => {
    const workflow = { ...baseWorkflow, name: '' }
    wrap(<WorkflowDetailPanel workflow={workflow} onClose={onClose} onUpdated={onUpdated} />)

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })) })

    await waitFor(() => {
      expect(screen.getByText('Workflow name is required.')).toBeInTheDocument()
    })
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
