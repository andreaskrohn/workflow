/** @jest-environment jsdom */
import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { LogPage } from '../LogPage'
import type { Task } from '@/lib/db/repositories/taskRepository'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    workflow_id: null,
    title: 'Fix the bug',
    description: null,
    notes: null,
    status: 'done',
    priority: 3,
    due_date: null,
    defer_date: null,
    review_date: null,
    created_at: 1_000_000,
    updated_at: 1_100_000,
    completed_at: 1_100_000,
    archived_at: null,
    position_x: null,
    position_y: null,
    end_goal: null,
    ...overrides,
  }
}

const DONE_A = makeTask({ id: 'task-1', title: 'Write tests', completed_at: 2_000_000 })
const DONE_B = makeTask({ id: 'task-2', title: 'Ship feature', completed_at: 1_000_000 })
const TODO_C = makeTask({ id: 'task-3', title: 'Pending task', status: 'todo', completed_at: null })

// ── fetch helpers ─────────────────────────────────────────────────────────────

function okJson(data: unknown): Response {
  return { ok: true, status: 200, json: async () => data } as unknown as Response
}

function mockFetch({
  logTasks = [] as Task[],
  searchTasks = [] as Task[],
} = {}) {
  ;(global.fetch as jest.Mock).mockImplementation((url: string) => {
    if (url === '/api/tasks/log') return Promise.resolve(okJson(logTasks))
    if ((url as string).startsWith('/api/tasks/search')) return Promise.resolve(okJson(searchTasks))
    return Promise.resolve(okJson([]))
  })
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  global.fetch = jest.fn()
})

afterEach(() => {
  jest.clearAllMocks()
})

async function wrap(props: React.ComponentProps<typeof LogPage> = {}) {
  let result!: ReturnType<typeof render>
  await act(async () => {
    result = render(<LogPage searchDebounceMs={0} {...props} />)
  })
  return result
}

// ── Rendering ─────────────────────────────────────────────────────────────────

it('renders a "Log" heading', async () => {
  mockFetch()
  await wrap()
  expect(screen.getByRole('heading', { name: 'Log' })).toBeInTheDocument()
})

it('shows a loading state while the initial fetch is in flight', async () => {
  let resolve!: (v: Response) => void
  ;(global.fetch as jest.Mock).mockReturnValue(
    new Promise<Response>((r) => { resolve = r }),
  )
  act(() => { render(<LogPage searchDebounceMs={0} />) })
  expect(screen.getByText(/loading/i)).toBeInTheDocument()
  await act(async () => { resolve(okJson([])) })
})

it('shows an empty-state message when there are no completed tasks', async () => {
  mockFetch({ logTasks: [] })
  await wrap()
  expect(screen.getByText(/no completed tasks yet/i)).toBeInTheDocument()
})

it('renders a row for each completed task', async () => {
  mockFetch({ logTasks: [DONE_A, DONE_B] })
  await wrap()
  expect(screen.getByText('Write tests')).toBeInTheDocument()
  expect(screen.getByText('Ship feature')).toBeInTheDocument()
})

it('displays a formatted completed date for each task', async () => {
  mockFetch({ logTasks: [DONE_A] })
  await wrap()
  // completed_at 2_000_000 seconds = 1970-01-24 (epoch-based) — just verify something is rendered
  const dateEl = screen.getByRole('listitem').querySelector('[aria-label^="Completed"]')
  expect(dateEl).not.toBeNull()
  expect(dateEl!.textContent).not.toBe('')
})

it('shows a v2 note about completed tasks in archived workflows not being shown', async () => {
  mockFetch()
  await wrap()
  expect(screen.getByText(/archived workflows/i)).toBeInTheDocument()
})

// ── Search ────────────────────────────────────────────────────────────────────

it('renders a search input', async () => {
  mockFetch()
  await wrap()
  expect(
    screen.getByRole('searchbox', { name: /search completed tasks/i }),
  ).toBeInTheDocument()
})

it('calls GET /api/tasks/search?q=... when text is entered', async () => {
  mockFetch({ logTasks: [DONE_A], searchTasks: [DONE_B] })
  await wrap()

  fireEvent.change(
    screen.getByRole('searchbox', { name: /search completed tasks/i }),
    { target: { value: 'ship' } },
  )

  await waitFor(() =>
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/tasks\/search\?q=ship/),
    ),
  )
})

it('shows only done tasks from search results', async () => {
  // Search API returns a mix: one done, one todo.
  mockFetch({ logTasks: [], searchTasks: [DONE_A, TODO_C] })
  await wrap()

  fireEvent.change(
    screen.getByRole('searchbox', { name: /search completed tasks/i }),
    { target: { value: 'task' } },
  )

  await waitFor(() => expect(screen.getByText('Write tests')).toBeInTheDocument())
  expect(screen.queryByText('Pending task')).toBeNull()
})

it('hides initial list while search results are active', async () => {
  mockFetch({ logTasks: [DONE_A], searchTasks: [DONE_B] })
  await wrap()

  fireEvent.change(
    screen.getByRole('searchbox', { name: /search completed tasks/i }),
    { target: { value: 'ship' } },
  )

  await waitFor(() => expect(screen.getByText('Ship feature')).toBeInTheDocument())
  expect(screen.queryByText('Write tests')).toBeNull()
})

it('shows a no-results message when the search yields no done tasks', async () => {
  // Search returns only a todo task, which gets filtered out.
  mockFetch({ logTasks: [], searchTasks: [TODO_C] })
  await wrap()

  fireEvent.change(
    screen.getByRole('searchbox', { name: /search completed tasks/i }),
    { target: { value: 'pending' } },
  )

  await waitFor(() =>
    expect(
      screen.getByText(/no completed tasks match your search/i),
    ).toBeInTheDocument(),
  )
})

it('restores the full completed list when the search is cleared', async () => {
  mockFetch({ logTasks: [DONE_A], searchTasks: [DONE_B] })
  await wrap()

  const input = screen.getByRole('searchbox', { name: /search completed tasks/i })

  fireEvent.change(input, { target: { value: 'ship' } })
  await waitFor(() => expect(screen.getByText('Ship feature')).toBeInTheDocument())

  fireEvent.change(input, { target: { value: '' } })
  await waitFor(() => expect(screen.getByText('Write tests')).toBeInTheDocument())
  expect(screen.queryByText('Ship feature')).toBeNull()
})

it('does not call the search API when the query is cleared', async () => {
  mockFetch({ logTasks: [DONE_A] })
  await wrap()

  const input = screen.getByRole('searchbox', { name: /search completed tasks/i })
  fireEvent.change(input, { target: { value: 'a' } })
  await waitFor(() =>
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/tasks/search'),
    ),
  )

  const callCount = (global.fetch as jest.Mock).mock.calls.length

  fireEvent.change(input, { target: { value: '' } })
  // No additional search call after clearing
  await waitFor(() => expect(screen.getByText('Write tests')).toBeInTheDocument())
  expect((global.fetch as jest.Mock).mock.calls.length).toBe(callCount)
})
