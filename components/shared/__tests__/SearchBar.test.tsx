/** @jest-environment jsdom */
import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import type { Task } from '@/lib/db/repositories/taskRepository'
import { SearchBar } from '../SearchBar'

// ── Helpers ───────────────────────────────────────────────────────────────────

const TASKS: Task[] = [
  { id: 1, title: 'First task', status: 'todo', description: null, notes: null, due_date: null, defer_date: null, review_date: null, project_id: null, created_at: 0, updated_at: 0, archived_at: null, tags: [] },
  { id: 2, title: 'Second task', status: 'done', description: null, notes: null, due_date: null, defer_date: null, review_date: null, project_id: null, created_at: 0, updated_at: 0, archived_at: null, tags: [] },
  { id: 3, title: 'Blocked task', status: 'blocked', description: null, notes: null, due_date: null, defer_date: null, review_date: null, project_id: null, created_at: 0, updated_at: 0, archived_at: null, tags: [] },
]

function okJson(data: unknown): Response {
  return { ok: true, status: 200, json: async () => data } as unknown as Response
}

function wrap(ui: React.ReactElement) {
  return render(ui)
}

function open() {
  fireEvent.keyDown(document, { key: '/' })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.useFakeTimers()
  global.fetch = jest.fn()
})

afterEach(() => {
  jest.runOnlyPendingTimers()
  jest.useRealTimers()
  jest.resetAllMocks()
})

// ── Open / close ──────────────────────────────────────────────────────────────

it('renders nothing when closed', () => {
  wrap(<SearchBar />)
  expect(screen.queryByRole('dialog')).toBeNull()
})

it('opens on "/" keydown', () => {
  wrap(<SearchBar />)
  open()
  expect(screen.getByRole('dialog')).toBeInTheDocument()
})

it('does not open on "/" when focus is inside an input', () => {
  wrap(
    <div>
      <input data-testid="other-input" />
      <SearchBar />
    </div>
  )
  const input = screen.getByTestId('other-input')
  input.focus()
  fireEvent.keyDown(input, { key: '/' })
  expect(screen.queryByRole('dialog')).toBeNull()
})

it('does not open on "/" when focus is inside a textarea', () => {
  wrap(
    <div>
      <textarea data-testid="other-textarea" />
      <SearchBar />
    </div>
  )
  const ta = screen.getByTestId('other-textarea')
  ta.focus()
  fireEvent.keyDown(ta, { key: '/' })
  expect(screen.queryByRole('dialog')).toBeNull()
})

it('closes on Escape', () => {
  wrap(<SearchBar />)
  open()
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.queryByRole('dialog')).toBeNull()
})

it('closes on backdrop click', () => {
  wrap(<SearchBar />)
  open()
  fireEvent.click(screen.getByTestId('search-backdrop'))
  expect(screen.queryByRole('dialog')).toBeNull()
})

it('focuses the input when opened', () => {
  wrap(<SearchBar />)
  open()
  expect(screen.getByRole('combobox')).toHaveFocus()
})

it('resets query and results when closed then reopened', async () => {
  ;(global.fetch as jest.Mock).mockResolvedValue(okJson(TASKS))
  wrap(<SearchBar />)
  open()

  const input = screen.getByRole('combobox')
  fireEvent.change(input, { target: { value: 'task' } })
  act(() => { jest.advanceTimersByTime(300) })
  await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(3))

  // Close then reopen
  fireEvent.keyDown(document, { key: 'Escape' })
  open()
  expect(screen.getByRole('combobox')).toHaveValue('')
  expect(screen.queryByRole('option')).toBeNull()
})

// ── Fetch / results ───────────────────────────────────────────────────────────

it('shows results after debounced fetch', async () => {
  ;(global.fetch as jest.Mock).mockResolvedValue(okJson(TASKS))
  wrap(<SearchBar />)
  open()

  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'task' } })
  // Fetch should NOT fire immediately
  expect(global.fetch).not.toHaveBeenCalled()

  act(() => { jest.advanceTimersByTime(300) })
  await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(3))
  expect(global.fetch).toHaveBeenCalledWith('/api/tasks/search?q=task')
})

it('passes query to the search API', async () => {
  ;(global.fetch as jest.Mock).mockResolvedValue(okJson([]))
  wrap(<SearchBar />)
  open()

  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'hello world' } })
  act(() => { jest.advanceTimersByTime(300) })
  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/tasks/search?q=hello%20world'))
})

it('shows task titles and status badges in results', async () => {
  ;(global.fetch as jest.Mock).mockResolvedValue(okJson(TASKS))
  wrap(<SearchBar />)
  open()

  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'task' } })
  act(() => { jest.advanceTimersByTime(300) })
  await waitFor(() => expect(screen.getByText('First task')).toBeInTheDocument())
  expect(screen.getByText('Second task')).toBeInTheDocument()
  expect(screen.getByText('Blocked task')).toBeInTheDocument()
  expect(screen.getByText('todo')).toBeInTheDocument()
  expect(screen.getByText('done')).toBeInTheDocument()
  expect(screen.getByText('blocked')).toBeInTheDocument()
})

it('shows "no results" message when fetch returns empty array', async () => {
  ;(global.fetch as jest.Mock).mockResolvedValue(okJson([]))
  wrap(<SearchBar />)
  open()

  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'xyz' } })
  act(() => { jest.advanceTimersByTime(300) })
  await waitFor(() => expect(screen.getByText(/No results for/)).toBeInTheDocument())
})

it('clears results when query is cleared', async () => {
  ;(global.fetch as jest.Mock).mockResolvedValue(okJson(TASKS))
  wrap(<SearchBar />)
  open()

  const input = screen.getByRole('combobox')
  fireEvent.change(input, { target: { value: 'task' } })
  act(() => { jest.advanceTimersByTime(300) })
  await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(3))

  fireEvent.change(input, { target: { value: '' } })
  expect(screen.queryByRole('option')).toBeNull()
  expect(screen.queryByText(/No results/)).toBeNull()
})

it('does not fire fetch for blank query', () => {
  wrap(<SearchBar />)
  open()

  fireEvent.change(screen.getByRole('combobox'), { target: { value: '   ' } })
  act(() => { jest.advanceTimersByTime(300) })
  expect(global.fetch).not.toHaveBeenCalled()
})

it('debounces: only one fetch when typing quickly', async () => {
  ;(global.fetch as jest.Mock).mockResolvedValue(okJson([]))
  wrap(<SearchBar />)
  open()

  const input = screen.getByRole('combobox')
  fireEvent.change(input, { target: { value: 'a' } })
  fireEvent.change(input, { target: { value: 'ab' } })
  fireEvent.change(input, { target: { value: 'abc' } })
  act(() => { jest.advanceTimersByTime(300) })
  await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1))
  expect(global.fetch).toHaveBeenCalledWith('/api/tasks/search?q=abc')
})

// ── Loading state ─────────────────────────────────────────────────────────────

it('shows loading indicator while fetch is in flight', async () => {
  let resolve!: (v: Response) => void
  ;(global.fetch as jest.Mock).mockReturnValue(new Promise<Response>((r) => { resolve = r }))
  wrap(<SearchBar />)
  open()

  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'task' } })
  act(() => { jest.advanceTimersByTime(300) })

  expect(screen.getByRole('status', { name: 'Loading search results' })).toBeInTheDocument()

  await act(async () => { resolve(okJson([])) })
  expect(screen.queryByRole('status', { name: 'Loading search results' })).toBeNull()
})

// ── Keyboard navigation ───────────────────────────────────────────────────────

it('ArrowDown selects the first option', async () => {
  ;(global.fetch as jest.Mock).mockResolvedValue(okJson(TASKS))
  wrap(<SearchBar />)
  open()

  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'task' } })
  act(() => { jest.advanceTimersByTime(300) })
  await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(3))

  fireEvent.keyDown(screen.getByRole('combobox'), { key: 'ArrowDown' })
  expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true')
})

it('ArrowDown wraps from last to first', async () => {
  ;(global.fetch as jest.Mock).mockResolvedValue(okJson(TASKS))
  wrap(<SearchBar />)
  open()

  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'task' } })
  act(() => { jest.advanceTimersByTime(300) })
  await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(3))

  const input = screen.getByRole('combobox')
  // Move to last option (3 downs = wrap to index 0 after 3 items... need 3 downs)
  fireEvent.keyDown(input, { key: 'ArrowDown' }) // index 0
  fireEvent.keyDown(input, { key: 'ArrowDown' }) // index 1
  fireEvent.keyDown(input, { key: 'ArrowDown' }) // index 2
  fireEvent.keyDown(input, { key: 'ArrowDown' }) // wraps to index 0
  expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true')
})

it('ArrowUp from no selection jumps to last option', async () => {
  ;(global.fetch as jest.Mock).mockResolvedValue(okJson(TASKS))
  wrap(<SearchBar />)
  open()

  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'task' } })
  act(() => { jest.advanceTimersByTime(300) })
  await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(3))

  fireEvent.keyDown(screen.getByRole('combobox'), { key: 'ArrowUp' })
  const options = screen.getAllByRole('option')
  expect(options[options.length - 1]).toHaveAttribute('aria-selected', 'true')
})

it('Enter on active result calls onSelect and closes', async () => {
  ;(global.fetch as jest.Mock).mockResolvedValue(okJson(TASKS))
  const onSelect = jest.fn()
  wrap(<SearchBar onSelect={onSelect} />)
  open()

  const input = screen.getByRole('combobox')
  fireEvent.change(input, { target: { value: 'task' } })
  act(() => { jest.advanceTimersByTime(300) })
  await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(3))

  fireEvent.keyDown(input, { key: 'ArrowDown' }) // select first
  fireEvent.keyDown(input, { key: 'Enter' })

  expect(onSelect).toHaveBeenCalledWith(TASKS[0])
  expect(screen.queryByRole('dialog')).toBeNull()
})

it('Enter with no active selection does nothing', async () => {
  ;(global.fetch as jest.Mock).mockResolvedValue(okJson(TASKS))
  const onSelect = jest.fn()
  wrap(<SearchBar onSelect={onSelect} />)
  open()

  const input = screen.getByRole('combobox')
  fireEvent.change(input, { target: { value: 'task' } })
  act(() => { jest.advanceTimersByTime(300) })
  await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(3))

  fireEvent.keyDown(input, { key: 'Enter' }) // no active selection
  expect(onSelect).not.toHaveBeenCalled()
  expect(screen.getByRole('dialog')).toBeInTheDocument()
})

it('clicking a result calls onSelect and closes', async () => {
  ;(global.fetch as jest.Mock).mockResolvedValue(okJson(TASKS))
  const onSelect = jest.fn()
  wrap(<SearchBar onSelect={onSelect} />)
  open()

  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'task' } })
  act(() => { jest.advanceTimersByTime(300) })
  await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(3))

  fireEvent.click(screen.getAllByRole('option')[1])
  expect(onSelect).toHaveBeenCalledWith(TASKS[1])
  expect(screen.queryByRole('dialog')).toBeNull()
})

it('mouseEnter on an option sets it as active', async () => {
  ;(global.fetch as jest.Mock).mockResolvedValue(okJson(TASKS))
  wrap(<SearchBar />)
  open()

  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'task' } })
  act(() => { jest.advanceTimersByTime(300) })
  await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(3))

  fireEvent.mouseEnter(screen.getAllByRole('option')[2])
  expect(screen.getAllByRole('option')[2]).toHaveAttribute('aria-selected', 'true')
})

// ── Keyboard hints footer ─────────────────────────────────────────────────────

it('shows keyboard hints when there are results', async () => {
  ;(global.fetch as jest.Mock).mockResolvedValue(okJson(TASKS))
  wrap(<SearchBar />)
  open()

  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'task' } })
  act(() => { jest.advanceTimersByTime(300) })
  await waitFor(() => expect(screen.getByText('Navigate')).toBeInTheDocument())
  expect(screen.getByText('Select')).toBeInTheDocument()
  expect(screen.getByText('Close')).toBeInTheDocument()
})

it('does not show keyboard hints when there are no results', async () => {
  ;(global.fetch as jest.Mock).mockResolvedValue(okJson([]))
  wrap(<SearchBar />)
  open()

  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'xyz' } })
  act(() => { jest.advanceTimersByTime(300) })
  await waitFor(() => expect(screen.getByText(/No results/)).toBeInTheDocument())
  expect(screen.queryByText('Navigate')).toBeNull()
})

// ── ARIA ──────────────────────────────────────────────────────────────────────

it('input has role="combobox" with correct aria attributes', () => {
  wrap(<SearchBar />)
  open()
  const input = screen.getByRole('combobox')
  expect(input).toHaveAttribute('aria-autocomplete', 'list')
  expect(input).toHaveAttribute('aria-controls', 'search-listbox')
})

it('results list has role="listbox"', async () => {
  ;(global.fetch as jest.Mock).mockResolvedValue(okJson(TASKS))
  wrap(<SearchBar />)
  open()

  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'task' } })
  act(() => { jest.advanceTimersByTime(300) })
  await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument())
})

it('aria-activedescendant points to the active option id', async () => {
  ;(global.fetch as jest.Mock).mockResolvedValue(okJson(TASKS))
  wrap(<SearchBar />)
  open()

  const input = screen.getByRole('combobox')
  fireEvent.change(input, { target: { value: 'task' } })
  act(() => { jest.advanceTimersByTime(300) })
  await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(3))

  fireEvent.keyDown(input, { key: 'ArrowDown' })
  expect(input).toHaveAttribute('aria-activedescendant', 'search-result-0')

  fireEvent.keyDown(input, { key: 'ArrowDown' })
  expect(input).toHaveAttribute('aria-activedescendant', 'search-result-1')
})

it('dialog has aria-modal and aria-label', () => {
  wrap(<SearchBar />)
  open()
  const dialog = screen.getByRole('dialog')
  expect(dialog).toHaveAttribute('aria-modal', 'true')
  expect(dialog).toHaveAttribute('aria-label', 'Search tasks')
})
