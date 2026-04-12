/** @jest-environment jsdom */
import React from 'react'
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react'
import { TagContextProvider, useTagContext } from '../TagContext'
import type { Tag } from '@/lib/db/repositories/tagRepository'

// ── Module mocks ──────────────────────────────────────────────────────────────

jest.mock('@/lib/middleware/csrf', () => ({
  getCsrfToken: jest.fn().mockResolvedValue('test-csrf-token'),
  invalidateCsrfToken: jest.fn().mockResolvedValue('test-csrf-token'),
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

const TAG_A: Tag = { id: 'tag-1', name: 'frontend', created_at: 1000 }
const TAG_B: Tag = { id: 'tag-2', name: 'backend', created_at: 2000 }

function okJson(data: unknown, status = 200): Response {
  return { ok: true, status, json: async () => data } as unknown as Response
}

function errJson(status: number, body: unknown): Response {
  return { ok: false, status, json: async () => body } as unknown as Response
}

/** Consumer that surfaces context values as testable DOM elements. */
function Consumer() {
  const { tags, loading, addTag, removeTag } = useTagContext()
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="count">{tags.length}</span>
      {tags.map((t) => (
        <span key={t.id} data-testid={`tag-${t.id}`}>
          {t.name}
        </span>
      ))}
      <button onClick={() => addTag('newTag')}>add</button>
      <button onClick={() => removeTag('tag-1')}>remove</button>
    </div>
  )
}

async function wrap(ui: React.ReactElement = <Consumer />) {
  let result!: ReturnType<typeof render>
  await act(async () => {
    result = render(<TagContextProvider>{ui}</TagContextProvider>)
  })
  return result
}

// ── Setup ─────────────────────────────────────────────────────────────────────

const { getCsrfToken } = jest.requireMock('@/lib/middleware/csrf') as {
  getCsrfToken: jest.Mock
}

beforeEach(() => {
  global.fetch = jest.fn()
  getCsrfToken.mockResolvedValue('test-csrf-token')
})

afterEach(() => {
  jest.clearAllMocks()
})

// ── Initial fetch ─────────────────────────────────────────────────────────────

it('fetches tags from GET /api/tags on mount', async () => {
  ;(global.fetch as jest.Mock).mockResolvedValue(okJson([TAG_A, TAG_B]))
  await wrap()
  expect(global.fetch).toHaveBeenCalledWith('/api/tags')
})

it('renders fetched tags', async () => {
  ;(global.fetch as jest.Mock).mockResolvedValue(okJson([TAG_A, TAG_B]))
  await wrap()
  expect(screen.getByTestId('tag-tag-1')).toHaveTextContent('frontend')
  expect(screen.getByTestId('tag-tag-2')).toHaveTextContent('backend')
  expect(screen.getByTestId('count')).toHaveTextContent('2')
})

it('loading is true before fetch resolves and false after', async () => {
  let resolve!: (v: Response) => void
  ;(global.fetch as jest.Mock).mockReturnValue(
    new Promise<Response>((r) => { resolve = r }),
  )
  // Don't await — fetch is pending, so we want to check loading=true synchronously
  act(() => { render(<TagContextProvider><Consumer /></TagContextProvider>) })
  expect(screen.getByTestId('loading')).toHaveTextContent('true')

  await act(async () => { resolve(okJson([TAG_A])) })
  expect(screen.getByTestId('loading')).toHaveTextContent('false')
})

it('leaves tags empty and loading false on fetch error', async () => {
  ;(global.fetch as jest.Mock).mockRejectedValue(new Error('network'))
  await wrap()
  expect(screen.getByTestId('loading')).toHaveTextContent('false')
  expect(screen.getByTestId('count')).toHaveTextContent('0')
})

// ── addTag ────────────────────────────────────────────────────────────────────

it('addTag posts to /api/tags with the correct method and body', async () => {
  ;(global.fetch as jest.Mock)
    .mockResolvedValueOnce(okJson([TAG_A]))            // initial fetch
    .mockResolvedValueOnce(okJson({ id: 'tag-3', name: 'newTag', created_at: 3000 }, 201))

  await wrap()
  expect(screen.getByTestId('count')).toHaveTextContent('1')

  fireEvent.click(screen.getByRole('button', { name: 'add' }))

  await waitFor(() =>
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/tags',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'newTag' }),
      }),
    ),
  )
})

it('addTag appends the new tag to the list', async () => {
  const newTag: Tag = { id: 'tag-3', name: 'newTag', created_at: 3000 }
  ;(global.fetch as jest.Mock)
    .mockResolvedValueOnce(okJson([TAG_A]))
    .mockResolvedValueOnce(okJson(newTag, 201))

  await wrap()
  expect(screen.getByTestId('count')).toHaveTextContent('1')

  fireEvent.click(screen.getByRole('button', { name: 'add' }))

  await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('2'))
  expect(screen.getByTestId('tag-tag-3')).toHaveTextContent('newTag')
})

it('addTag returns the new tag on success', async () => {
  const newTag: Tag = { id: 'tag-3', name: 'newTag', created_at: 3000 }
  ;(global.fetch as jest.Mock)
    .mockResolvedValueOnce(okJson([]))
    .mockResolvedValueOnce(okJson(newTag, 201))

  let result: Tag | null = null

  function Consumer2() {
    const { addTag } = useTagContext()
    return (
      <button
        onClick={async () => {
          result = await addTag('newTag')
        }}
      >
        add
      </button>
    )
  }

  await wrap(<Consumer2 />)

  fireEvent.click(screen.getByRole('button', { name: 'add' }))

  await waitFor(() => expect(result).toEqual(newTag))
})

it('addTag returns null when the server responds with an error', async () => {
  ;(global.fetch as jest.Mock)
    .mockResolvedValueOnce(okJson([]))
    .mockResolvedValueOnce(errJson(422, { error: 'Tag name is required.' }))

  let result: Tag | null = undefined as unknown as Tag | null

  function Consumer2() {
    const { addTag } = useTagContext()
    return (
      <button
        onClick={async () => {
          result = await addTag('')
        }}
      >
        add
      </button>
    )
  }

  await wrap(<Consumer2 />)

  fireEvent.click(screen.getByRole('button', { name: 'add' }))

  await waitFor(() => expect(result).toBeNull())
})

it('addTag does not mutate state when server returns error', async () => {
  ;(global.fetch as jest.Mock)
    .mockResolvedValueOnce(okJson([TAG_A]))
    .mockResolvedValueOnce(errJson(422, { error: 'Validation error.' }))

  await wrap()
  expect(screen.getByTestId('count')).toHaveTextContent('1')

  fireEvent.click(screen.getByRole('button', { name: 'add' }))

  // Wait for the POST to resolve then confirm state is unchanged
  await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2))
  expect(screen.getByTestId('count')).toHaveTextContent('1')
})

// ── removeTag ─────────────────────────────────────────────────────────────────

it('removeTag sends DELETE to /api/tags/:id', async () => {
  ;(global.fetch as jest.Mock)
    .mockResolvedValueOnce(okJson([TAG_A, TAG_B]))
    .mockResolvedValueOnce({ ok: true, status: 204 } as unknown as Response)

  await wrap()
  expect(screen.getByTestId('count')).toHaveTextContent('2')

  fireEvent.click(screen.getByRole('button', { name: 'remove' }))

  await waitFor(() =>
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/tags/tag-1',
      expect.objectContaining({ method: 'DELETE' }),
    ),
  )
})

it('removeTag removes the tag from the list', async () => {
  ;(global.fetch as jest.Mock)
    .mockResolvedValueOnce(okJson([TAG_A, TAG_B]))
    .mockResolvedValueOnce({ ok: true, status: 204 } as unknown as Response)

  await wrap()
  expect(screen.getByTestId('count')).toHaveTextContent('2')

  fireEvent.click(screen.getByRole('button', { name: 'remove' }))

  await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('1'))
  expect(screen.queryByTestId('tag-tag-1')).toBeNull()
  expect(screen.getByTestId('tag-tag-2')).toBeInTheDocument()
})

it('removeTag does not mutate state when server returns error', async () => {
  ;(global.fetch as jest.Mock)
    .mockResolvedValueOnce(okJson([TAG_A, TAG_B]))
    .mockResolvedValueOnce(errJson(404, { error: 'Tag not found.' }))

  await wrap()
  expect(screen.getByTestId('count')).toHaveTextContent('2')

  fireEvent.click(screen.getByRole('button', { name: 'remove' }))

  await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2))
  expect(screen.getByTestId('count')).toHaveTextContent('2')
})

it('removeTag silently ignores network errors', async () => {
  ;(global.fetch as jest.Mock)
    .mockResolvedValueOnce(okJson([TAG_A]))
    .mockRejectedValueOnce(new Error('network'))

  await wrap()
  expect(screen.getByTestId('count')).toHaveTextContent('1')

  await expect(
    act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'remove' }))
    }),
  ).resolves.not.toThrow()

  expect(screen.getByTestId('count')).toHaveTextContent('1')
})

// ── Default context value ─────────────────────────────────────────────────────

it('useTagContext outside provider returns safe defaults (no throw)', () => {
  function Bare() {
    const { tags, loading } = useTagContext()
    return (
      <div>
        <span data-testid="count">{tags.length}</span>
        <span data-testid="loading">{String(loading)}</span>
      </div>
    )
  }
  // No TagContextProvider wrapper — must not throw
  expect(() => render(<Bare />)).not.toThrow()
  expect(screen.getByTestId('count')).toHaveTextContent('0')
  expect(screen.getByTestId('loading')).toHaveTextContent('false')
})

// ── Children are rendered ─────────────────────────────────────────────────────

it('TagContextProvider renders its children', async () => {
  ;(global.fetch as jest.Mock).mockResolvedValue(okJson([]))
  await act(async () => {
    render(
      <TagContextProvider>
        <span data-testid="child">hello</span>
      </TagContextProvider>,
    )
  })
  expect(screen.getByTestId('child')).toHaveTextContent('hello')
})
