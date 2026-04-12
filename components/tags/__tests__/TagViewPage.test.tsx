/** @jest-environment jsdom */
import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { TagViewPage } from '../TagViewPage'
import type { Tag } from '@/lib/db/repositories/tagRepository'
import type { Task } from '@/lib/db/repositories/taskRepository'

// ── Module mocks ──────────────────────────────────────────────────────────────

jest.mock('@/components/tags/TagContext', () => ({
  useTagContext: jest.fn(),
}))

const { useTagContext } = jest.requireMock('@/components/tags/TagContext') as {
  useTagContext: jest.Mock
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TAG_A: Tag = { id: 'tag-a', name: 'frontend', created_at: 1000 }
const TAG_B: Tag = { id: 'tag-b', name: 'backend', created_at: 2000 }

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    workflow_id: null,
    title: 'Fix the bug',
    description: null,
    notes: null,
    status: 'todo',
    priority: 3,
    due_date: null,
    defer_date: null,
    review_date: null,
    created_at: 1_000_000,
    updated_at: 1_100_000,
    completed_at: null,
    archived_at: null,
    position_x: null,
    position_y: null,
    end_goal: null,
    ...overrides,
  }
}

const TASK_1 = makeTask({ id: 'task-1', title: 'Write docs', due_date: 1_700_000 })
const TASK_2 = makeTask({ id: 'task-2', title: 'Add tests' })

// ── Helpers ───────────────────────────────────────────────────────────────────

function okJson(data: unknown): Response {
  return { ok: true, status: 200, json: async () => data } as unknown as Response
}

function mockContext(tags: Tag[] = [], loading = false) {
  useTagContext.mockReturnValue({ tags, loading, addTag: jest.fn(), removeTag: jest.fn() })
}

beforeEach(() => {
  global.fetch = jest.fn()
  jest.clearAllMocks()
})

async function wrap() {
  let result!: ReturnType<typeof render>
  await act(async () => {
    result = render(<TagViewPage />)
  })
  return result
}

// ── Rendering ─────────────────────────────────────────────────────────────────

it('renders a "Tasks by Tag" heading', async () => {
  mockContext()
  await wrap()
  expect(screen.getByRole('heading', { name: /tasks by tag/i })).toBeInTheDocument()
})

it('shows a loading message while tags are loading', async () => {
  mockContext([], true)
  await wrap()
  expect(screen.getByText(/loading tags/i)).toBeInTheDocument()
})

it('shows a "no tags yet" message when there are no tags', async () => {
  mockContext([])
  await wrap()
  expect(screen.getByText(/no tags yet/i)).toBeInTheDocument()
})

it('renders a button for each tag from context', async () => {
  mockContext([TAG_A, TAG_B])
  await wrap()
  expect(screen.getByRole('button', { name: 'frontend' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'backend' })).toBeInTheDocument()
})

it('shows the "select tags" prompt when no tags are selected', async () => {
  mockContext([TAG_A])
  await wrap()
  expect(screen.getByText(/select one or more tags/i)).toBeInTheDocument()
})

// ── Tag selection ─────────────────────────────────────────────────────────────

it('marks a tag button as pressed after clicking it', async () => {
  mockContext([TAG_A])
  ;(global.fetch as jest.Mock).mockResolvedValue(okJson([]))
  await wrap()

  const btn = screen.getByRole('button', { name: 'frontend' })
  expect(btn).toHaveAttribute('aria-pressed', 'false')

  await act(async () => { fireEvent.click(btn) })

  expect(screen.getByRole('button', { name: 'frontend' })).toHaveAttribute('aria-pressed', 'true')
})

it('calls GET /api/tasks/by-tag?tags=... when a tag is selected', async () => {
  mockContext([TAG_A])
  ;(global.fetch as jest.Mock).mockResolvedValue(okJson([]))
  await wrap()

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'frontend' }))
  })

  expect(global.fetch).toHaveBeenCalledWith(
    expect.stringContaining(`/api/tasks/by-tag?tags=${TAG_A.id}`),
  )
})

it('deselecting the only selected tag clears the task list and hides the fetch prompt', async () => {
  mockContext([TAG_A])
  ;(global.fetch as jest.Mock).mockResolvedValue(okJson([TASK_1]))
  await wrap()

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'frontend' }))
  })
  await waitFor(() => expect(screen.getByText('Write docs')).toBeInTheDocument())

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'frontend' }))
  })

  expect(screen.queryByText('Write docs')).toBeNull()
  expect(screen.getByText(/select one or more tags/i)).toBeInTheDocument()
})

// ── Task list rendering ───────────────────────────────────────────────────────

it('shows tasks returned by the API after a tag is selected', async () => {
  mockContext([TAG_A])
  ;(global.fetch as jest.Mock).mockResolvedValue(okJson([TASK_1, TASK_2]))
  await wrap()

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'frontend' }))
  })
  await waitFor(() => expect(screen.getByText('Write docs')).toBeInTheDocument())

  expect(screen.getByText('Add tests')).toBeInTheDocument()
})

it('shows the due_date for tasks that have one', async () => {
  mockContext([TAG_A])
  ;(global.fetch as jest.Mock).mockResolvedValue(okJson([TASK_1]))
  await wrap()

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'frontend' }))
  })

  // TASK_1.due_date = 1_700_000 seconds → tsToDateInput formats it as YYYY-MM-DD
  await waitFor(() => {
    const item = screen.getByRole('listitem')
    expect(item.textContent).toContain('1970')
  })
})

it('shows a no-results message when the API returns an empty list', async () => {
  mockContext([TAG_A])
  ;(global.fetch as jest.Mock).mockResolvedValue(okJson([]))
  await wrap()

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'frontend' }))
  })
  await waitFor(() =>
    expect(screen.getByText(/no enabled tasks for the selected tags/i)).toBeInTheDocument(),
  )
})

// ── OR logic (two tags) ───────────────────────────────────────────────────────

it('OR logic: query includes both tag IDs when two tags are selected', async () => {
  mockContext([TAG_A, TAG_B])
  ;(global.fetch as jest.Mock).mockResolvedValue(okJson([]))
  await wrap()

  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'frontend' })) })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'backend' })) })

  await waitFor(() => {
    const calls = (global.fetch as jest.Mock).mock.calls
    const lastUrl = calls[calls.length - 1]![0] as string
    expect(lastUrl).toContain(TAG_A.id)
    expect(lastUrl).toContain(TAG_B.id)
  })
})

it('OR logic: shows tasks from both tags', async () => {
  mockContext([TAG_A, TAG_B])
  ;(global.fetch as jest.Mock)
    .mockResolvedValueOnce(okJson([TASK_1]))     // after selecting tag A
    .mockResolvedValueOnce(okJson([TASK_1, TASK_2])) // after also selecting tag B

  await wrap()

  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'frontend' })) })
  await waitFor(() => expect(screen.getByText('Write docs')).toBeInTheDocument())

  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'backend' })) })
  await waitFor(() => expect(screen.getByText('Add tests')).toBeInTheDocument())
  expect(screen.getByText('Write docs')).toBeInTheDocument()
})
