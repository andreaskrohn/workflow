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
    if (url.startsWith('/api/tasks/')) return Promise.resolve(ok(tasks[0]))
    return Promise.reject(new Error(`Unexpected fetch: ${url}`))
  })
}

function keydown(key: string, opts: KeyboardEventInit = {}) {
  document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...opts }))
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

// ── j/k keyboard navigation ───────────────────────────────────────────────────

it('pressing j sets aria-current on the first item', async () => {
  setupFetch([task1, task2])
  wrap(<NowPage />)

  await waitFor(() => expect(screen.getByText('Beta task')).toBeInTheDocument())

  act(() => { keydown('j') })

  const items = screen.getAllByRole('listitem')
  expect(items[0]).toHaveAttribute('aria-current', 'true')
})

it('pressing j twice moves focus to the second item', async () => {
  setupFetch([task1, task2])
  wrap(<NowPage />)

  await waitFor(() => expect(screen.getByText('Beta task')).toBeInTheDocument())

  act(() => {
    keydown('j')
    keydown('j')
  })

  const items = screen.getAllByRole('listitem')
  expect(items[0]).not.toHaveAttribute('aria-current')
  expect(items[1]).toHaveAttribute('aria-current', 'true')
})

it('pressing k from the second item moves focus back to the first', async () => {
  setupFetch([task1, task2])
  wrap(<NowPage />)

  await waitFor(() => expect(screen.getByText('Beta task')).toBeInTheDocument())

  act(() => {
    keydown('j')
    keydown('j')
    keydown('k')
  })

  const items = screen.getAllByRole('listitem')
  expect(items[0]).toHaveAttribute('aria-current', 'true')
  expect(items[1]).not.toHaveAttribute('aria-current')
})

it('j does not go below the last item', async () => {
  setupFetch([task1])
  wrap(<NowPage />)

  await waitFor(() => expect(screen.getByText('Alpha task')).toBeInTheDocument())

  act(() => {
    keydown('j')
    keydown('j')
    keydown('j')
  })

  const items = screen.getAllByRole('listitem')
  expect(items[0]).toHaveAttribute('aria-current', 'true')
})

it('k does not go above the first item', async () => {
  setupFetch([task1, task2])
  wrap(<NowPage />)

  await waitFor(() => expect(screen.getByText('Beta task')).toBeInTheDocument())

  act(() => {
    keydown('j')
    keydown('k')
    keydown('k')
  })

  const items = screen.getAllByRole('listitem')
  expect(items[0]).toHaveAttribute('aria-current', 'true')
})

// ── c — complete focused task ─────────────────────────────────────────────────

it('pressing c with no focused task does nothing', async () => {
  setupFetch([task1, task2])
  wrap(<NowPage />)

  await waitFor(() => expect(screen.getByText('Alpha task')).toBeInTheDocument())

  // No j pressed — focusedIndex is null.
  act(() => { keydown('c') })

  // Both tasks still visible, no PATCH fired.
  expect(screen.getByText('Alpha task')).toBeInTheDocument()
  expect(screen.getByText('Beta task')).toBeInTheDocument()
  const patchCalls = mockFetch.mock.calls.filter(([url, init]: [string, RequestInit | undefined]) =>
    url.startsWith('/api/tasks/') && init?.method === 'PATCH',
  )
  expect(patchCalls).toHaveLength(0)
})

it('pressing c removes the focused task from the list', async () => {
  setupFetch([task1, task2])
  wrap(<NowPage />)

  // Sorted: Beta (due 1M) first, Alpha (due 2M) second.
  await waitFor(() => expect(screen.getByText('Beta task')).toBeInTheDocument())

  // j and c must be in separate act() calls so React re-renders and the
  // useKeyboardShortcuts ref is updated with the new focusedIndex before c fires.
  act(() => { keydown('j') }) // focus first item (Beta)
  await act(async () => { keydown('c') }) // complete Beta

  await waitFor(() => expect(screen.queryByText('Beta task')).toBeNull())
  expect(screen.getByText('Alpha task')).toBeInTheDocument()
})

it('pressing c sends PATCH status=done for the focused task', async () => {
  setupFetch([task2]) // Beta (due 1M)
  wrap(<NowPage />)

  await waitFor(() => expect(screen.getByText('Beta task')).toBeInTheDocument())

  act(() => { keydown('j') })
  await act(async () => { keydown('c') })

  const patchCalls = mockFetch.mock.calls.filter(([url, init]: [string, RequestInit | undefined]) =>
    url === `/api/tasks/${task2.id}` && init?.method === 'PATCH',
  )
  expect(patchCalls).toHaveLength(1)
  const body = JSON.parse(patchCalls[0][1].body as string)
  expect(body.status).toBe('done')
})

// ── Cmd+Z undo ────────────────────────────────────────────────────────────────

it('Cmd+Z after completion restores the task to the list', async () => {
  setupFetch([task1])
  wrap(<NowPage />)

  await waitFor(() => expect(screen.getByText('Alpha task')).toBeInTheDocument())

  act(() => { keydown('j') })
  await act(async () => { keydown('c') })

  await waitFor(() => expect(screen.queryByText('Alpha task')).toBeNull())

  await act(async () => { keydown('z', { metaKey: true }) })

  await waitFor(() => expect(screen.getByText('Alpha task')).toBeInTheDocument())
})

it('Cmd+Z sends PATCH to restore the previous status', async () => {
  setupFetch([task1])
  wrap(<NowPage />)

  await waitFor(() => expect(screen.getByText('Alpha task')).toBeInTheDocument())

  act(() => { keydown('j') })
  await act(async () => { keydown('c') })

  await waitFor(() => expect(screen.queryByText('Alpha task')).toBeNull())

  await act(async () => { keydown('z', { metaKey: true }) })

  const calls = mockFetch.mock.calls as [string, RequestInit][]
  const undoCall = calls.find(([url, init]: [string, RequestInit | undefined]) =>
    url === `/api/tasks/${task1.id}` && init?.method === 'PATCH' &&
    JSON.parse(init.body as string).status === task1.status,
  )
  expect(undoCall).toBeDefined()
})

it('Ctrl+Z also triggers undo', async () => {
  setupFetch([task1])
  wrap(<NowPage />)

  await waitFor(() => expect(screen.getByText('Alpha task')).toBeInTheDocument())

  act(() => { keydown('j') })
  await act(async () => { keydown('c') })

  await waitFor(() => expect(screen.queryByText('Alpha task')).toBeNull())

  await act(async () => { keydown('z', { ctrlKey: true }) })

  await waitFor(() => expect(screen.getByText('Alpha task')).toBeInTheDocument())
})
