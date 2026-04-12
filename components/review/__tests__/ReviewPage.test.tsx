/** @jest-environment jsdom */
import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { ReviewPage } from '../ReviewPage'
import type { WorkflowReviewItem } from '@/lib/db/repositories/reviewRepository'
import { addDays, addMonths, dateInputToTs } from '@/lib/utils/dates'

// ── Module mocks ──────────────────────────────────────────────────────────────

jest.mock('@/lib/middleware/csrf', () => ({
  getCsrfToken: jest.fn().mockResolvedValue('test-csrf-token'),
}))

const { getCsrfToken } = jest.requireMock('@/lib/middleware/csrf') as {
  getCsrfToken: jest.Mock
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TODAY_TS = (() => {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  return Math.floor(d.getTime() / 1000)
})()

function makeItem(overrides: Partial<WorkflowReviewItem> = {}): WorkflowReviewItem {
  return {
    id: 'wf-1',
    name: 'Improve search',
    end_goal: 'Users can find anything instantly.',
    review_date: TODAY_TS,
    enabled_task_count: 3,
    ...overrides,
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function okJson(data: unknown): Response {
  return { ok: true, status: 200, json: async () => data } as unknown as Response
}

function mockReviewFetch(items: WorkflowReviewItem[]) {
  ;(global.fetch as jest.Mock).mockImplementation((url: string) => {
    if (url === '/api/review') return Promise.resolve(okJson(items))
    return Promise.resolve(okJson({}))
  })
}

beforeEach(() => {
  global.fetch = jest.fn()
  getCsrfToken.mockResolvedValue('test-csrf-token')
})

afterEach(() => {
  jest.clearAllMocks()
})

async function wrap() {
  let result!: ReturnType<typeof render>
  await act(async () => {
    result = render(<ReviewPage />)
  })
  return result
}

// ── Rendering ─────────────────────────────────────────────────────────────────

it('renders a "Review" heading', async () => {
  mockReviewFetch([])
  await wrap()
  expect(screen.getByRole('heading', { name: 'Review' })).toBeInTheDocument()
})

it('shows a loading state while the initial fetch is in flight', async () => {
  let resolve!: (v: Response) => void
  ;(global.fetch as jest.Mock).mockReturnValue(
    new Promise<Response>((r) => { resolve = r }),
  )
  act(() => { render(<ReviewPage />) })
  expect(screen.getByText(/loading/i)).toBeInTheDocument()
  await act(async () => { resolve(okJson([])) })
})

it('shows an empty-state message when no workflows are due', async () => {
  mockReviewFetch([])
  await wrap()
  expect(screen.getByText(/no workflows due for review/i)).toBeInTheDocument()
})

it('renders the workflow name', async () => {
  mockReviewFetch([makeItem({ name: 'Overhaul billing' })])
  await wrap()
  expect(screen.getByText('Overhaul billing')).toBeInTheDocument()
})

it('renders the end_goal when present', async () => {
  mockReviewFetch([makeItem({ end_goal: 'Zero billing errors.' })])
  await wrap()
  expect(screen.getByText('Zero billing errors.')).toBeInTheDocument()
})

it('does not render an end_goal paragraph when end_goal is null', async () => {
  mockReviewFetch([makeItem({ end_goal: null })])
  await wrap()
  // The paragraph text should not appear — just name + meta
  expect(screen.queryByText(/zero billing errors/i)).toBeNull()
})

it('shows the enabled task count', async () => {
  mockReviewFetch([makeItem({ enabled_task_count: 4 })])
  await wrap()
  expect(screen.getByText(/4 enabled tasks/i)).toBeInTheDocument()
})

it('uses singular "enabled task" for a count of 1', async () => {
  mockReviewFetch([makeItem({ enabled_task_count: 1 })])
  await wrap()
  expect(screen.getByText(/1 enabled task\b/i)).toBeInTheDocument()
})

it('shows the review due date', async () => {
  mockReviewFetch([makeItem({ review_date: TODAY_TS })])
  await wrap()
  // The component renders tsToDateInput(review_date) which is a YYYY-MM-DD string
  expect(screen.getByText(/review due/i)).toBeInTheDocument()
})

// ── Shortcut buttons ──────────────────────────────────────────────────────────

it('renders four shortcut buttons per workflow item', async () => {
  mockReviewFetch([makeItem()])
  await wrap()
  expect(screen.getByRole('button', { name: /\+1 week for/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /\+2 weeks for/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /\+1 month for/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /\+3 months for/i })).toBeInTheDocument()
})

it('clicking "+1 week" PATCHes /api/workflows/[id]', async () => {
  mockReviewFetch([makeItem({ id: 'wf-42' })])
  ;(global.fetch as jest.Mock).mockImplementation((url: string) => {
    if (url === '/api/review') return Promise.resolve(okJson([makeItem({ id: 'wf-42' })]))
    return Promise.resolve(okJson({}))
  })
  await wrap()

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /\+1 week for/i }))
  })

  expect(global.fetch).toHaveBeenCalledWith(
    '/api/workflows/wf-42',
    expect.objectContaining({ method: 'PATCH' }),
  )
})

it('the PATCH body for "+1 week" contains review_date 7 days from now', async () => {
  const item = makeItem({ id: 'wf-week' })
  mockReviewFetch([item])
  ;(global.fetch as jest.Mock).mockImplementation((url: string) => {
    if (url === '/api/review') return Promise.resolve(okJson([item]))
    if (url === `/api/workflows/${item.id}`) return Promise.resolve(okJson({}))
    return Promise.resolve(okJson({}))
  })
  await wrap()

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /\+1 week for/i }))
  })

  const calls = (global.fetch as jest.Mock).mock.calls
  const patchCall = calls.find(([url]: [string]) => url.includes('/api/workflows/'))
  const body = JSON.parse(patchCall![1].body as string) as { review_date: number }
  const expectedTs = dateInputToTs(addDays(null, 7))!
  expect(body.review_date).toBe(expectedTs)
})

it('the PATCH body for "+3 months" contains review_date 3 months from now', async () => {
  const item = makeItem({ id: 'wf-months' })
  mockReviewFetch([item])
  ;(global.fetch as jest.Mock).mockImplementation((url: string) => {
    if (url === '/api/review') return Promise.resolve(okJson([item]))
    if (url === `/api/workflows/${item.id}`) return Promise.resolve(okJson({}))
    return Promise.resolve(okJson({}))
  })
  await wrap()

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /\+3 months for/i }))
  })

  const calls = (global.fetch as jest.Mock).mock.calls
  const patchCall = calls.find(([url]: [string]) => url.includes('/api/workflows/'))
  const body = JSON.parse(patchCall![1].body as string) as { review_date: number }
  const expectedTs = dateInputToTs(addMonths(null, 3))!
  expect(body.review_date).toBe(expectedTs)
})

it('the PATCH request includes the CSRF token', async () => {
  const item = makeItem({ id: 'wf-csrf' })
  ;(global.fetch as jest.Mock).mockImplementation((url: string) => {
    if (url === '/api/review') return Promise.resolve(okJson([item]))
    return Promise.resolve(okJson({}))
  })
  await wrap()

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /\+1 week for/i }))
  })

  expect(global.fetch).toHaveBeenCalledWith(
    `/api/workflows/${item.id}`,
    expect.objectContaining({
      headers: expect.objectContaining({ 'X-CSRF-Token': 'test-csrf-token' }),
    }),
  )
})

it('removes the workflow from the list after a successful reschedule', async () => {
  const item = makeItem({ id: 'wf-remove', name: 'Will be removed' })
  ;(global.fetch as jest.Mock).mockImplementation((url: string) => {
    if (url === '/api/review') return Promise.resolve(okJson([item]))
    return Promise.resolve({ ok: true, status: 200, json: async () => ({}) } as unknown as Response)
  })
  await wrap()

  expect(screen.getByText('Will be removed')).toBeInTheDocument()

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /\+1 week for/i }))
  })

  expect(screen.queryByText('Will be removed')).toBeNull()
})

it('keeps the workflow in the list when the PATCH fails', async () => {
  const item = makeItem({ id: 'wf-fail', name: 'Stays in list' })
  ;(global.fetch as jest.Mock).mockImplementation((url: string) => {
    if (url === '/api/review') return Promise.resolve(okJson([item]))
    return Promise.resolve({ ok: false, status: 500, json: async () => ({}) } as unknown as Response)
  })
  await wrap()

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /\+1 week for/i }))
  })

  expect(screen.getByText('Stays in list')).toBeInTheDocument()
})

it('disables shortcut buttons while the PATCH is in flight', async () => {
  const item = makeItem({ id: 'wf-busy' })
  let resolvePatch!: (r: Response) => void
  ;(global.fetch as jest.Mock).mockImplementation((url: string) => {
    if (url === '/api/review') return Promise.resolve(okJson([item]))
    return new Promise<Response>((r) => { resolvePatch = r })
  })
  await wrap()

  fireEvent.click(screen.getByRole('button', { name: /\+1 week for/i }))

  await waitFor(() =>
    expect(screen.getByRole('button', { name: /\+1 week for/i })).toBeDisabled(),
  )
  await act(async () => { resolvePatch({ ok: true, status: 200, json: async () => ({}) } as unknown as Response) })
})

it('renders separate shortcut sets for multiple workflows', async () => {
  mockReviewFetch([
    makeItem({ id: 'wf-a', name: 'Alpha' }),
    makeItem({ id: 'wf-b', name: 'Beta' }),
  ])
  await wrap()
  expect(screen.getByRole('button', { name: /\+1 week for alpha/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /\+1 week for beta/i })).toBeInTheDocument()
})
