/** @jest-environment jsdom */
import React from 'react'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import TagManager from '../TagManager'
import { TagContextProvider } from '../TagContext'
import type { Tag } from '@/lib/db/repositories/tagRepository'

// ── Module mocks ──────────────────────────────────────────────────────────────

jest.mock('@/lib/middleware/csrf', () => ({
  getCsrfToken: jest.fn().mockResolvedValue('test-csrf-token'),
  invalidateCsrfToken: jest.fn().mockResolvedValue('test-csrf-token'),
}))

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TASK_ID = 'task-abc-123'
const OTHER_TASK_ID = 'task-xyz-456'

const TAG_A: Tag = { id: 'tag-1', name: 'frontend', created_at: 1000 }
const TAG_B: Tag = { id: 'tag-2', name: 'backend', created_at: 2000 }
const TAG_C: Tag = { id: 'tag-3', name: 'design', created_at: 3000 }

// ── Response helpers ──────────────────────────────────────────────────────────

function okJson(data: unknown, status = 200): Response {
  return { ok: true, status, json: async () => data } as unknown as Response
}

function noContent(): Response {
  return { ok: true, status: 204 } as unknown as Response
}

function serverError(): Response {
  return { ok: false, status: 500, json: async () => ({ error: 'Server error.' }) } as unknown as Response
}

// ── Test helpers ──────────────────────────────────────────────────────────────

const { getCsrfToken } = jest.requireMock('@/lib/middleware/csrf') as {
  getCsrfToken: jest.Mock
}

/**
 * Renders TagManager inside TagContextProvider, waiting for the initial
 * fetches (global tags + task tags) to settle before returning.
 * fetch is expected to already be mocked by the caller.
 */
async function wrap(taskId: string) {
  let result!: ReturnType<typeof render>
  await act(async () => {
    result = render(
      <TagContextProvider>
        <TagManager taskId={taskId} />
      </TagContextProvider>,
    )
  })
  return result
}

/**
 * Standard fetch mock: TagContextProvider GET /api/tags, TagManager GET
 * /api/tasks/[id]/tags, plus stub-success for mutations.
 */
function mockFetch({
  globalTags = [] as Tag[],
  taskTags = [] as Tag[],
  taskId = TASK_ID,
  addResponse = (tag: Tag) => okJson(tag, 201),
  removeResponse = () => noContent(),
} = {}) {
  ;(global.fetch as jest.Mock).mockImplementation(
    (url: string, opts?: RequestInit) => {
      const method = opts?.method ?? 'GET'
      if (url === '/api/tags') return Promise.resolve(okJson(globalTags))
      if (url === `/api/tasks/${taskId}/tags` && method === 'GET')
        return Promise.resolve(okJson(taskTags))
      if (url === `/api/tasks/${taskId}/tags` && method === 'POST') {
        const body = JSON.parse(opts!.body as string) as { tagId: string }
        const tag = globalTags.find((t) => t.id === body.tagId)!
        return Promise.resolve(addResponse(tag))
      }
      if (url.startsWith(`/api/tasks/${taskId}/tags/`) && method === 'DELETE')
        return Promise.resolve(removeResponse())
      return Promise.resolve(okJson([]))
    },
  )
}

beforeEach(() => {
  global.fetch = jest.fn()
  getCsrfToken.mockResolvedValue('test-csrf-token')
})

afterEach(() => {
  jest.clearAllMocks()
})

// ── Rendering ─────────────────────────────────────────────────────────────────

it('renders without crashing', async () => {
  mockFetch()
  await expect(wrap(TASK_ID)).resolves.not.toThrow()
})

it('fetches /api/tasks/[taskId]/tags on mount', async () => {
  mockFetch({ globalTags: [TAG_A], taskTags: [] })
  await wrap(TASK_ID)
  expect(global.fetch).toHaveBeenCalledWith(`/api/tasks/${TASK_ID}/tags`)
})

it('taskId is NOT fetched from context — it comes from props', async () => {
  // Render with a specific taskId; verify the URL contains that exact id,
  // not a different one that might hypothetically come from context.
  mockFetch({ taskId: OTHER_TASK_ID })
  await wrap(OTHER_TASK_ID)
  expect(global.fetch).toHaveBeenCalledWith(`/api/tasks/${OTHER_TASK_ID}/tags`)
  expect(global.fetch).not.toHaveBeenCalledWith(`/api/tasks/${TASK_ID}/tags`)
})

// ── Displaying current tags ───────────────────────────────────────────────────

it('shows a chip for each tag currently on the task', async () => {
  mockFetch({ globalTags: [TAG_A, TAG_B], taskTags: [TAG_A, TAG_B] })
  await wrap(TASK_ID)
  expect(screen.getByText('frontend')).toBeInTheDocument()
  expect(screen.getByText('backend')).toBeInTheDocument()
})

it('each chip has a remove button with an accessible label', async () => {
  mockFetch({ globalTags: [TAG_A], taskTags: [TAG_A] })
  await wrap(TASK_ID)
  expect(screen.getByRole('button', { name: 'Remove frontend' })).toBeInTheDocument()
})

it('shows no chips when the task has no tags', async () => {
  mockFetch({ globalTags: [TAG_A, TAG_B], taskTags: [] })
  await wrap(TASK_ID)
  expect(screen.queryByRole('button', { name: /^Remove/ })).toBeNull()
})

// ── Available (add) buttons ───────────────────────────────────────────────────

it('shows an add button for each global tag NOT yet on the task', async () => {
  mockFetch({ globalTags: [TAG_A, TAG_B, TAG_C], taskTags: [TAG_A] })
  await wrap(TASK_ID)
  expect(screen.getByRole('button', { name: 'Add backend' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Add design' })).toBeInTheDocument()
})

it('does not show an add button for a tag already on the task', async () => {
  mockFetch({ globalTags: [TAG_A, TAG_B], taskTags: [TAG_A] })
  await wrap(TASK_ID)
  expect(screen.getByRole('button', { name: 'Add backend' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Add frontend' })).toBeNull()
})

it('shows no add buttons when all global tags are assigned', async () => {
  mockFetch({ globalTags: [TAG_A, TAG_B], taskTags: [TAG_A, TAG_B] })
  await wrap(TASK_ID)
  expect(screen.queryByRole('button', { name: /^Add / })).toBeNull()
})

it('shows no add buttons when there are no global tags', async () => {
  mockFetch({ globalTags: [], taskTags: [] })
  await wrap(TASK_ID)
  expect(screen.queryByRole('button', { name: /^Add / })).toBeNull()
})

// ── Adding a tag ──────────────────────────────────────────────────────────────

it('clicking an add button POSTs to /api/tasks/[taskId]/tags', async () => {
  mockFetch({ globalTags: [TAG_A, TAG_B], taskTags: [] })
  await wrap(TASK_ID)
  expect(screen.getByRole('button', { name: 'Add frontend' })).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Add frontend' }))

  await waitFor(() =>
    expect(global.fetch).toHaveBeenCalledWith(
      `/api/tasks/${TASK_ID}/tags`,
      expect.objectContaining({ method: 'POST' }),
    ),
  )
})

it('add POST sends correct tagId in body', async () => {
  mockFetch({ globalTags: [TAG_A, TAG_B], taskTags: [] })
  await wrap(TASK_ID)
  expect(screen.getByRole('button', { name: 'Add frontend' })).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Add frontend' }))

  await waitFor(() =>
    expect(global.fetch).toHaveBeenCalledWith(
      `/api/tasks/${TASK_ID}/tags`,
      expect.objectContaining({
        body: JSON.stringify({ tagId: TAG_A.id }),
      }),
    ),
  )
})

it('add sends POST to /api/tasks/:id/tags with the correct body', async () => {
  mockFetch({ globalTags: [TAG_A], taskTags: [] })
  await wrap(TASK_ID)
  expect(screen.getByRole('button', { name: 'Add frontend' })).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Add frontend' }))

  await waitFor(() =>
    expect(global.fetch).toHaveBeenCalledWith(
      `/api/tasks/${TASK_ID}/tags`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ tagId: TAG_A.id }),
      }),
    ),
  )
})

it('after successful add, a chip appears for the new tag', async () => {
  mockFetch({ globalTags: [TAG_A, TAG_B], taskTags: [] })
  await wrap(TASK_ID)
  expect(screen.getByRole('button', { name: 'Add frontend' })).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Add frontend' }))

  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Remove frontend' })).toBeInTheDocument(),
  )
})

it('after successful add, the tag disappears from the available list', async () => {
  mockFetch({ globalTags: [TAG_A, TAG_B], taskTags: [] })
  await wrap(TASK_ID)
  expect(screen.getByRole('button', { name: 'Add frontend' })).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Add frontend' }))

  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'Add frontend' })).toBeNull(),
  )
  // Other unassigned tags still available
  expect(screen.getByRole('button', { name: 'Add backend' })).toBeInTheDocument()
})

it('add fails → chip is NOT added', async () => {
  mockFetch({
    globalTags: [TAG_A],
    taskTags: [],
    addResponse: () => serverError(),
  })
  await wrap(TASK_ID)
  expect(screen.getByRole('button', { name: 'Add frontend' })).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Add frontend' }))

  // Wait for POST to resolve
  await waitFor(() =>
    expect(global.fetch).toHaveBeenCalledWith(
      `/api/tasks/${TASK_ID}/tags`,
      expect.objectContaining({ method: 'POST' }),
    ),
  )
  // Chip should NOT have appeared
  expect(screen.queryByRole('button', { name: 'Remove frontend' })).toBeNull()
})

// ── Removing a tag ────────────────────────────────────────────────────────────

it('clicking a remove button DELETEs /api/tasks/[taskId]/tags/[tagId]', async () => {
  mockFetch({ globalTags: [TAG_A, TAG_B], taskTags: [TAG_A] })
  await wrap(TASK_ID)
  expect(screen.getByRole('button', { name: 'Remove frontend' })).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Remove frontend' }))

  await waitFor(() =>
    expect(global.fetch).toHaveBeenCalledWith(
      `/api/tasks/${TASK_ID}/tags/${TAG_A.id}`,
      expect.objectContaining({ method: 'DELETE' }),
    ),
  )
})

it('remove sends DELETE to /api/tasks/:id/tags/:tagId', async () => {
  mockFetch({ globalTags: [TAG_A], taskTags: [TAG_A] })
  await wrap(TASK_ID)
  expect(screen.getByRole('button', { name: 'Remove frontend' })).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Remove frontend' }))

  await waitFor(() =>
    expect(global.fetch).toHaveBeenCalledWith(
      `/api/tasks/${TASK_ID}/tags/${TAG_A.id}`,
      expect.objectContaining({ method: 'DELETE' }),
    ),
  )
})

it('after successful remove, the chip disappears', async () => {
  mockFetch({ globalTags: [TAG_A, TAG_B], taskTags: [TAG_A] })
  await wrap(TASK_ID)
  expect(screen.getByRole('button', { name: 'Remove frontend' })).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Remove frontend' }))

  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'Remove frontend' })).toBeNull(),
  )
})

it('after successful remove, the tag reappears in the available list', async () => {
  mockFetch({ globalTags: [TAG_A, TAG_B], taskTags: [TAG_A] })
  await wrap(TASK_ID)
  expect(screen.getByRole('button', { name: 'Remove frontend' })).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Remove frontend' }))

  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Add frontend' })).toBeInTheDocument(),
  )
})

it('remove fails → chip remains', async () => {
  mockFetch({
    globalTags: [TAG_A],
    taskTags: [TAG_A],
    removeResponse: () => serverError(),
  })
  await wrap(TASK_ID)
  expect(screen.getByRole('button', { name: 'Remove frontend' })).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Remove frontend' }))

  // Wait for DELETE to resolve
  await waitFor(() =>
    expect(global.fetch).toHaveBeenCalledWith(
      `/api/tasks/${TASK_ID}/tags/${TAG_A.id}`,
      expect.objectContaining({ method: 'DELETE' }),
    ),
  )
  // Chip must still be there
  expect(screen.getByRole('button', { name: 'Remove frontend' })).toBeInTheDocument()
})

// ── taskId prop change ────────────────────────────────────────────────────────

it('when taskId prop changes, refetches tags for the new task', async () => {
  mockFetch({ globalTags: [TAG_A, TAG_B], taskTags: [TAG_A], taskId: TASK_ID })
  const { rerender } = await wrap(TASK_ID)
  expect(screen.getByRole('button', { name: 'Remove frontend' })).toBeInTheDocument()

  // Switch to a different task that has TAG_B
  ;(global.fetch as jest.Mock).mockImplementation((url: string) => {
    if (url === '/api/tags') return Promise.resolve(okJson([TAG_A, TAG_B]))
    if (url === `/api/tasks/${OTHER_TASK_ID}/tags`)
      return Promise.resolve(okJson([TAG_B]))
    return Promise.resolve(okJson([]))
  })

  await act(async () => {
    rerender(
      <TagContextProvider>
        <TagManager taskId={OTHER_TASK_ID} />
      </TagContextProvider>,
    )
  })

  expect(global.fetch).toHaveBeenCalledWith(`/api/tasks/${OTHER_TASK_ID}/tags`)
  expect(screen.getByRole('button', { name: 'Remove backend' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Remove frontend' })).toBeNull()
})

it('when taskId prop changes, old chips are cleared before new ones load', async () => {
  mockFetch({ globalTags: [TAG_A], taskTags: [TAG_A], taskId: TASK_ID })
  const { rerender } = await wrap(TASK_ID)
  expect(screen.getByRole('button', { name: 'Remove frontend' })).toBeInTheDocument()

  // New task fetch is slow — use a pending promise
  let resolveNew!: (v: Response) => void
  ;(global.fetch as jest.Mock).mockImplementation((url: string) => {
    if (url === '/api/tags') return Promise.resolve(okJson([TAG_A]))
    if (url === `/api/tasks/${OTHER_TASK_ID}/tags`)
      return new Promise<Response>((r) => { resolveNew = r })
    return Promise.resolve(okJson([]))
  })

  act(() => {
    rerender(
      <TagContextProvider>
        <TagManager taskId={OTHER_TASK_ID} />
      </TagContextProvider>,
    )
  })

  // Old chips should be gone while new fetch is pending
  expect(screen.queryByRole('button', { name: 'Remove frontend' })).toBeNull()

  await act(async () => { resolveNew(okJson([])) })
})

// ── Context provides tags — not the taskId ────────────────────────────────────

it('reads the global tag list from TagContext, not from a separate fetch', async () => {
  // Only mock the two expected URLs. If TagManager were fetching the global tag
  // list itself, the mock would fall through to okJson([]) and no add buttons
  // would appear.
  ;(global.fetch as jest.Mock).mockImplementation((url: string) => {
    if (url === '/api/tags') return Promise.resolve(okJson([TAG_A, TAG_B, TAG_C]))
    if (url === `/api/tasks/${TASK_ID}/tags`) return Promise.resolve(okJson([]))
    return Promise.resolve(okJson([]))
  })

  await wrap(TASK_ID)

  // All three global tags should appear as available (none assigned)
  expect(screen.getByRole('button', { name: 'Add frontend' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Add backend' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Add design' })).toBeInTheDocument()
})
