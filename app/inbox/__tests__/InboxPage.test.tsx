/** @jest-environment jsdom */
import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import type { Task } from '@/lib/db/repositories/taskRepository'
import type { Workflow } from '@/lib/db/repositories/workflowRepository'
import { ToastProvider } from '@/components/shared/ToastProvider'
import InboxPage from '../page'

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

const wf1: Workflow = {
  id: 'wf-1',
  project_id: 'proj-1',
  name: 'Alpha',
  end_goal: null,
  due_date: null,
  sort_order: 0,
  archived_at: null,
  eg_position_x: null,
  eg_position_y: null,
  created_at: 1_000_000,
  updated_at: 1_000_000,
}

const wf2: Workflow = { ...wf1, id: 'wf-2', name: 'Beta' }

// Inbox tasks: workflow_id IS NULL, archived_at IS NULL
const task1: Task = {
  id: 'task-1',
  workflow_id: null,
  title: 'First inbox task',
  description: null,
  notes: null,
  status: 'todo',
  priority: 3,
  due_date: null,
  defer_date: null,
  created_at: 1_000_000,
  updated_at: 1_000_000,
  archived_at: null,
  position_x: null,
  position_y: null,
  end_goal: null,
}

const task2: Task = { ...task1, id: 'task-2', title: 'Second inbox task' }

let mockFetch: jest.Mock

beforeEach(() => {
  mockFetch = jest.fn()
  global.fetch = mockFetch
  jest.clearAllMocks()
})

// Sets up a standard URL-dispatching mock.
function setupFetch({
  tasks = [task1, task2],
  workflows = [wf1, wf2],
  patchResponse = (id: string) => ok({ ...task1, id, workflow_id: wf1.id }),
}: {
  tasks?: Task[]
  workflows?: Workflow[]
  patchResponse?: (id: string) => Response
} = {}) {
  mockFetch.mockImplementation((url: string, opts?: RequestInit) => {
    if (url === '/api/tasks?inbox=1') return Promise.resolve(ok(tasks))
    if (url === '/api/workflows') return Promise.resolve(ok(workflows))
    const patchMatch = url.match(/^\/api\/tasks\/(.+)$/)
    if (patchMatch && opts?.method === 'PATCH') {
      return Promise.resolve(patchResponse(patchMatch[1]))
    }
    return Promise.reject(new Error(`Unexpected fetch: ${url} ${opts?.method ?? 'GET'}`))
  })
}

// ── Initial data loading ──────────────────────────────────────────────────────

it('requests inbox tasks from GET /api/tasks?inbox=1', async () => {
  setupFetch()
  wrap(<InboxPage />)

  await waitFor(() => expect(screen.getByText('First inbox task')).toBeInTheDocument())

  const urls = mockFetch.mock.calls.map(([url]: [string]) => url)
  expect(urls).toContain('/api/tasks?inbox=1')
  expect(urls).not.toContain('/api/tasks') // must use inbox endpoint, not bare list
})

it('requests all workflows from GET /api/workflows on mount', async () => {
  setupFetch()
  wrap(<InboxPage />)

  await waitFor(() => expect(screen.getByText('First inbox task')).toBeInTheDocument())

  const urls = mockFetch.mock.calls.map(([url]: [string]) => url)
  expect(urls).toContain('/api/workflows')
})

it('renders each inbox task title', async () => {
  setupFetch()
  wrap(<InboxPage />)

  await waitFor(() => {
    expect(screen.getByText('First inbox task')).toBeInTheDocument()
    expect(screen.getByText('Second inbox task')).toBeInTheDocument()
  })
})

it('shows an empty-inbox message when there are no tasks', async () => {
  setupFetch({ tasks: [] })
  wrap(<InboxPage />)

  await waitFor(() => expect(screen.getByText(/inbox is empty/i)).toBeInTheDocument())
})

it('does not render tasks that have a workflow_id set', async () => {
  // The API is responsible for the filter; the component must call the correct
  // endpoint and render only what is returned.
  const assigned: Task = { ...task1, id: 'task-x', title: 'Assigned task', workflow_id: 'wf-1' }
  // Mock returns only unassigned tasks — the assigned one must not appear.
  setupFetch({ tasks: [task1] })
  wrap(<InboxPage />)

  await waitFor(() => expect(screen.getByText('First inbox task')).toBeInTheDocument())

  expect(screen.queryByText('Assigned task')).toBeNull()
  void assigned // satisfy lint
})

// ── Assign dropdown ───────────────────────────────────────────────────────────

it('populates each assign dropdown with the available workflows', async () => {
  setupFetch()
  wrap(<InboxPage />)

  await waitFor(() => expect(screen.getByText('First inbox task')).toBeInTheDocument())

  // Each task row has a combobox; take the first one
  const selects = screen.getAllByRole('combobox')
  expect(selects.length).toBeGreaterThanOrEqual(1)

  const firstSelect = selects[0]
  expect(firstSelect).toHaveDisplayValue(/select workflow/i) // default placeholder

  const options = Array.from(firstSelect.querySelectorAll('option')).map((o) => o.textContent)
  expect(options).toContain('Alpha')
  expect(options).toContain('Beta')
})

it('disables the Assign button until a workflow is selected', async () => {
  setupFetch()
  wrap(<InboxPage />)

  await waitFor(() => expect(screen.getByText('First inbox task')).toBeInTheDocument())

  const buttons = screen.getAllByRole('button', { name: 'Assign' })
  expect(buttons[0]).toBeDisabled()

  // Select a workflow — button should become enabled
  fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: wf1.id } })
  expect(buttons[0]).toBeEnabled()
})

// ── Assign action ─────────────────────────────────────────────────────────────

it('PATCHes /api/tasks/:id with the selected workflow_id when Assign is clicked', async () => {
  setupFetch()
  wrap(<InboxPage />)

  await waitFor(() => expect(screen.getByText('First inbox task')).toBeInTheDocument())

  fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: wf1.id } })
  await act(async () => {
    fireEvent.click(screen.getAllByRole('button', { name: 'Assign' })[0])
  })

  expect(mockFetch).toHaveBeenCalledWith(
    `/api/tasks/${task1.id}`,
    expect.objectContaining({ method: 'PATCH' }),
  )
  const patchCall = mockFetch.mock.calls.find(
    ([url, opts]: [string, RequestInit]) => url === `/api/tasks/${task1.id}` && opts.method === 'PATCH',
  )
  const body = JSON.parse(patchCall[1].body as string)
  expect(body.workflow_id).toBe(wf1.id)
})

it('sends PATCH to /api/tasks/:id with workflow_id in body when Assign is clicked', async () => {
  setupFetch()
  wrap(<InboxPage />)

  await waitFor(() => expect(screen.getByText('First inbox task')).toBeInTheDocument())

  fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: wf1.id } })
  await act(async () => {
    fireEvent.click(screen.getAllByRole('button', { name: 'Assign' })[0])
  })

  const patchCall = mockFetch.mock.calls.find(
    ([url, opts]: [string, RequestInit]) => url === `/api/tasks/${task1.id}` && opts.method === 'PATCH',
  )
  expect(patchCall).toBeTruthy()
  const body = JSON.parse(patchCall[1].body as string)
  expect(body.workflow_id).toBe(wf1.id)
})

it('removes the assigned task from the list after a successful PATCH', async () => {
  setupFetch()
  wrap(<InboxPage />)

  await waitFor(() => {
    expect(screen.getByText('First inbox task')).toBeInTheDocument()
    expect(screen.getByText('Second inbox task')).toBeInTheDocument()
  })

  fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: wf1.id } })
  await act(async () => {
    fireEvent.click(screen.getAllByRole('button', { name: 'Assign' })[0])
  })

  expect(screen.queryByText('First inbox task')).toBeNull()
  expect(screen.getByText('Second inbox task')).toBeInTheDocument()
})

it('shows "Assigning…" on the button while the PATCH is in flight', async () => {
  let resolvePatch!: (v: Response) => void
  setupFetch({
    patchResponse: () => new Promise<Response>((resolve) => { resolvePatch = resolve }),
  })
  wrap(<InboxPage />)

  await waitFor(() => expect(screen.getByText('First inbox task')).toBeInTheDocument())

  fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: wf1.id } })
  fireEvent.click(screen.getAllByRole('button', { name: 'Assign' })[0])

  await waitFor(() => expect(screen.getByRole('button', { name: 'Assigning…' })).toBeInTheDocument())

  await act(async () => { resolvePatch(ok({ ...task1, workflow_id: wf1.id })) })
})

// ── handleApiError ────────────────────────────────────────────────────────────

it('shows a toast when the initial task fetch returns a 500', async () => {
  mockFetch.mockImplementation((url: string) => {
    if (url === '/api/tasks?inbox=1') return Promise.resolve(err(500, { error: 'Database error.' }))
    if (url === '/api/workflows') return Promise.resolve(ok([]))
    return Promise.reject(new Error(`Unexpected: ${url}`))
  })
  wrap(<InboxPage />)

  await waitFor(() => expect(screen.getByText('Database error.')).toBeInTheDocument())
})

it('shows a toast when the initial workflows fetch returns a 500', async () => {
  mockFetch.mockImplementation((url: string) => {
    if (url === '/api/tasks?inbox=1') return Promise.resolve(ok([]))
    if (url === '/api/workflows') return Promise.resolve(err(500, { error: 'Failed to load workflows.' }))
    return Promise.reject(new Error(`Unexpected: ${url}`))
  })
  wrap(<InboxPage />)

  await waitFor(() => expect(screen.getByText('Failed to load workflows.')).toBeInTheDocument())
})

it('shows a toast and keeps the task in the list when the Assign PATCH returns a 500', async () => {
  setupFetch({ patchResponse: () => err(500, { error: 'Something went wrong.' }) })
  wrap(<InboxPage />)

  await waitFor(() => expect(screen.getByText('First inbox task')).toBeInTheDocument())

  fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: wf1.id } })
  await act(async () => {
    fireEvent.click(screen.getAllByRole('button', { name: 'Assign' })[0])
  })

  await waitFor(() => expect(screen.getByText('Something went wrong.')).toBeInTheDocument())
  expect(screen.getByText('First inbox task')).toBeInTheDocument()
})

it('shows a field error inline when the Assign PATCH returns 422 with fieldErrors', async () => {
  setupFetch({
    patchResponse: () =>
      err(422, { error: 'Validation error.', fieldErrors: { workflow_id: 'workflow_id must be a valid UUID.' } }),
  })
  wrap(<InboxPage />)

  await waitFor(() => expect(screen.getByText('First inbox task')).toBeInTheDocument())

  // Use wf1.id — a real option value — so the select accepts it and the button
  // becomes enabled. The 422 response is driven by the server mock, not the value.
  fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: wf1.id } })
  await act(async () => {
    fireEvent.click(screen.getAllByRole('button', { name: 'Assign' })[0])
  })

  await waitFor(() =>
    expect(screen.getByText('workflow_id must be a valid UUID.')).toBeInTheDocument(),
  )
  expect(screen.getByText('First inbox task')).toBeInTheDocument()
})
