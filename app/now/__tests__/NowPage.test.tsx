/** @jest-environment jsdom */
import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import type { Task } from '@/lib/db/repositories/taskRepository'
import { ToastProvider } from '@/components/shared/ToastProvider'
import NowPage from '../page'

// ── Module mocks ──────────────────────────────────────────────────────────────

jest.mock('@/lib/middleware/csrf', () => ({
  getCsrfToken: jest.fn().mockResolvedValue('test-csrf-token'),
  invalidateCsrfToken: jest.fn().mockResolvedValue('test-csrf-token'),
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

function ok<T>(data: T): Response {
  return { ok: true, status: 200, json: async () => data } as unknown as Response
}

function err(status: number, body: unknown): Response {
  return { ok: false, status, json: async () => body } as unknown as Response
}

function wrap(ui: React.ReactElement) {
  return render(<ToastProvider>{ui}</ToastProvider>)
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const task1: Task = {
  id: 'task-1',
  workflow_id: null,
  title: 'Alpha task',
  description: null,
  notes: null,
  status: 'todo',
  priority: 3,
  due_date: 2_000_000,
  defer_date: null,
  created_at: 1_000_000,
  updated_at: 1_000_000,
  archived_at: null,
  position_x: null,
  position_y: null,
  end_goal: null,
}

const task2: Task = {
  ...task1,
  id: 'task-2',
  title: 'Beta task',
  due_date: 1_000_000, // earlier due date — should sort first
}

const task3: Task = {
  ...task1,
  id: 'task-3',
  title: 'Gamma task',
  due_date: null, // no due date — should sort last
}

let mockFetch: jest.Mock

beforeEach(() => {
  mockFetch = jest.fn()
  global.fetch = mockFetch
  jest.clearAllMocks()
})

function setupFetch(tasks: Task[] = [task1, task2, task3]) {
  mockFetch.mockImplementation((url: string) => {
    if (url === '/api/tasks/now') return Promise.resolve(ok(tasks))
    return Promise.reject(new Error(`Unexpected fetch: ${url}`))
  })
}

// ── Initial data loading ──────────────────────────────────────────────────────

it('requests tasks from GET /api/tasks/now', async () => {
  setupFetch()
  wrap(<NowPage />)

  await waitFor(() => expect(screen.getByText('Alpha task')).toBeInTheDocument())

  const urls = mockFetch.mock.calls.map(([url]: [string]) => url)
  expect(urls).toContain('/api/tasks/now')
})

it('renders each task title', async () => {
  setupFetch()
  wrap(<NowPage />)

  await waitFor(() => {
    expect(screen.getByText('Alpha task')).toBeInTheDocument()
    expect(screen.getByText('Beta task')).toBeInTheDocument()
    expect(screen.getByText('Gamma task')).toBeInTheDocument()
  })
})

it('shows an empty state when there are no tasks', async () => {
  setupFetch([])
  wrap(<NowPage />)

  await waitFor(() => expect(screen.getByText(/nothing to do/i)).toBeInTheDocument())
})

// ── Sort order ────────────────────────────────────────────────────────────────

it('displays tasks sorted by due_date ASC, nulls last', async () => {
  // API returns unsorted; page must sort client-side
  setupFetch([task3, task1, task2]) // Gamma (null), Alpha (2M), Beta (1M)
  wrap(<NowPage />)

  await waitFor(() => expect(screen.getByText('Beta task')).toBeInTheDocument())

  const titles = screen.getAllByRole('listitem').map((li) => li.textContent)
  const betaIdx = titles.findIndex((t) => t?.includes('Beta task'))
  const alphaIdx = titles.findIndex((t) => t?.includes('Alpha task'))
  const gammaIdx = titles.findIndex((t) => t?.includes('Gamma task'))

  expect(betaIdx).toBeLessThan(alphaIdx)
  expect(alphaIdx).toBeLessThan(gammaIdx)
})

it('places tasks with no due_date after tasks that have one', async () => {
  setupFetch([task3, task1]) // Gamma (null), Alpha (2M)
  wrap(<NowPage />)

  await waitFor(() => expect(screen.getByText('Alpha task')).toBeInTheDocument())

  const items = screen.getAllByRole('listitem')
  const alphaIdx = items.findIndex((li) => li.textContent?.includes('Alpha task'))
  const gammaIdx = items.findIndex((li) => li.textContent?.includes('Gamma task'))

  expect(alphaIdx).toBeLessThan(gammaIdx)
})

// ── Text filter ───────────────────────────────────────────────────────────────

it('renders a search input', async () => {
  setupFetch()
  wrap(<NowPage />)

  await waitFor(() => expect(screen.getByText('Alpha task')).toBeInTheDocument())

  expect(screen.getByRole('searchbox', { name: /filter/i })).toBeInTheDocument()
})

it('filters tasks by title (case-insensitive)', async () => {
  setupFetch([task1, task2])
  wrap(<NowPage />)

  await waitFor(() => expect(screen.getByText('Alpha task')).toBeInTheDocument())

  fireEvent.change(screen.getByRole('searchbox', { name: /filter/i }), {
    target: { value: 'alpha' },
  })

  expect(screen.getByText('Alpha task')).toBeInTheDocument()
  expect(screen.queryByText('Beta task')).toBeNull()
})

it('shows all tasks when the filter is cleared', async () => {
  setupFetch([task1, task2])
  wrap(<NowPage />)

  await waitFor(() => expect(screen.getByText('Alpha task')).toBeInTheDocument())

  const input = screen.getByRole('searchbox', { name: /filter/i })
  fireEvent.change(input, { target: { value: 'alpha' } })
  fireEvent.change(input, { target: { value: '' } })

  expect(screen.getByText('Alpha task')).toBeInTheDocument()
  expect(screen.getByText('Beta task')).toBeInTheDocument()
})

it('shows a "no matches" message when the filter matches nothing', async () => {
  setupFetch([task1, task2])
  wrap(<NowPage />)

  await waitFor(() => expect(screen.getByText('Alpha task')).toBeInTheDocument())

  fireEvent.change(screen.getByRole('searchbox', { name: /filter/i }), {
    target: { value: 'zzznomatch' },
  })

  expect(screen.getByText(/no tasks match/i)).toBeInTheDocument()
  expect(screen.queryByText('Alpha task')).toBeNull()
})

// ── Error handling ────────────────────────────────────────────────────────────

it('shows a toast when the fetch returns a 500', async () => {
  mockFetch.mockResolvedValue(err(500, { error: 'Internal server error.' }))
  wrap(<NowPage />)

  await waitFor(() => expect(screen.getByText('Internal server error.')).toBeInTheDocument())
})

// ── Loading state ─────────────────────────────────────────────────────────────

it('shows a loading indicator before data arrives', async () => {
  let resolve!: (r: Response) => void
  mockFetch.mockReturnValue(new Promise<Response>((res) => { resolve = res }))

  wrap(<NowPage />)

  expect(screen.getByText(/loading/i)).toBeInTheDocument()

  await act(async () => { resolve(ok([task1])) })
})
