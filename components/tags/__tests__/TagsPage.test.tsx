/** @jest-environment jsdom */
import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { TagsPage } from '../TagsPage'
import type { Tag } from '@/lib/db/repositories/tagRepository'

// ── Module mocks ──────────────────────────────────────────────────────────────

jest.mock('@/components/tags/TagContext', () => ({
  useTagContext: jest.fn(),
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

const { useTagContext } = jest.requireMock('@/components/tags/TagContext') as {
  useTagContext: jest.Mock
}

const TAG_A: Tag = { id: 'tag-1', name: 'frontend', created_at: 1000 }
const TAG_B: Tag = { id: 'tag-2', name: 'backend', created_at: 2000 }

function mockContext({
  tags = [] as Tag[],
  loading = false,
  addTag = jest.fn().mockResolvedValue(null as Tag | null),
  removeTag = jest.fn().mockResolvedValue(undefined),
} = {}) {
  useTagContext.mockReturnValue({ tags, loading, addTag, removeTag })
  return { addTag, removeTag }
}

function wrap() {
  return render(<TagsPage />)
}

beforeEach(() => {
  jest.clearAllMocks()
})

// ── Rendering ─────────────────────────────────────────────────────────────────

it('renders a tag name input', () => {
  mockContext()
  wrap()
  expect(screen.getByRole('textbox', { name: /tag name/i })).toBeInTheDocument()
})

it('renders a Create tag submit button', () => {
  mockContext()
  wrap()
  expect(screen.getByRole('button', { name: 'Create tag' })).toBeInTheDocument()
})

it('shows a loading state while the tag list is being fetched', () => {
  mockContext({ loading: true })
  wrap()
  expect(screen.getByText(/loading/i)).toBeInTheDocument()
})

it('renders each existing tag by name', () => {
  mockContext({ tags: [TAG_A, TAG_B] })
  wrap()
  expect(screen.getByText('frontend')).toBeInTheDocument()
  expect(screen.getByText('backend')).toBeInTheDocument()
})

it('shows an empty-state message when there are no tags', () => {
  mockContext({ tags: [] })
  wrap()
  expect(screen.getByText(/no tags yet/i)).toBeInTheDocument()
})

it('renders a delete button for each existing tag', () => {
  mockContext({ tags: [TAG_A, TAG_B] })
  wrap()
  expect(screen.getByRole('button', { name: 'Delete frontend' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Delete backend' })).toBeInTheDocument()
})

// ── Client-side validation ────────────────────────────────────────────────────

it('shows "Tag name is required." when submitting with an empty name', async () => {
  mockContext()
  wrap()
  fireEvent.click(screen.getByRole('button', { name: 'Create tag' }))
  expect(await screen.findByText('Tag name is required.')).toBeInTheDocument()
})

it('does not call addTag when name is empty', async () => {
  const { addTag } = mockContext()
  wrap()
  fireEvent.click(screen.getByRole('button', { name: 'Create tag' }))
  await screen.findByText('Tag name is required.')
  expect(addTag).not.toHaveBeenCalled()
})

it('shows "Tag name must not exceed 50 characters." for a too-long name', async () => {
  mockContext()
  wrap()
  fireEvent.change(screen.getByRole('textbox', { name: /tag name/i }), {
    target: { value: 'a'.repeat(51) },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Create tag' }))
  expect(await screen.findByText('Tag name must not exceed 50 characters.')).toBeInTheDocument()
})

it('shows "A tag with that name already exists." when the name is a duplicate', async () => {
  mockContext({ tags: [TAG_A] })
  wrap()
  fireEvent.change(screen.getByRole('textbox', { name: /tag name/i }), {
    target: { value: 'frontend' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Create tag' }))
  expect(await screen.findByText('A tag with that name already exists.')).toBeInTheDocument()
})

it('does not call addTag when the name is a known duplicate', async () => {
  const { addTag } = mockContext({ tags: [TAG_A] })
  wrap()
  fireEvent.change(screen.getByRole('textbox', { name: /tag name/i }), {
    target: { value: 'frontend' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Create tag' }))
  await screen.findByText('A tag with that name already exists.')
  expect(addTag).not.toHaveBeenCalled()
})

it('clears the validation error when the user starts typing', async () => {
  mockContext()
  wrap()
  fireEvent.click(screen.getByRole('button', { name: 'Create tag' }))
  await screen.findByText('Tag name is required.')

  fireEvent.change(screen.getByRole('textbox', { name: /tag name/i }), {
    target: { value: 'a' },
  })
  expect(screen.queryByText('Tag name is required.')).toBeNull()
})

// ── Successful create ─────────────────────────────────────────────────────────

it('calls addTag with the trimmed input value on submit', async () => {
  const newTag: Tag = { id: 'tag-3', name: 'design', created_at: 3000 }
  const { addTag } = mockContext({ addTag: jest.fn().mockResolvedValue(newTag) })
  wrap()

  fireEvent.change(screen.getByRole('textbox', { name: /tag name/i }), {
    target: { value: '  design  ' },
  })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Create tag' }))
  })

  expect(addTag).toHaveBeenCalledWith('design')
})

it('clears the input after a successful create', async () => {
  const newTag: Tag = { id: 'tag-3', name: 'design', created_at: 3000 }
  mockContext({ addTag: jest.fn().mockResolvedValue(newTag) })
  wrap()

  const input = screen.getByRole('textbox', { name: /tag name/i })
  fireEvent.change(input, { target: { value: 'design' } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Create tag' }))
  })

  expect(input).toHaveValue('')
})

it('disables the Create tag button while the request is in flight', async () => {
  let resolve!: (t: Tag | null) => void
  mockContext({
    addTag: jest.fn().mockReturnValue(new Promise<Tag | null>((r) => { resolve = r })),
  })
  wrap()

  fireEvent.change(screen.getByRole('textbox', { name: /tag name/i }), {
    target: { value: 'design' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Create tag' }))

  await waitFor(() =>
    expect(screen.getByRole('button', { name: /creating/i })).toBeDisabled(),
  )
  await act(async () => { resolve(null) })
})

// ── addTag failure ────────────────────────────────────────────────────────────

it('shows an error message when addTag returns null', async () => {
  mockContext({ addTag: jest.fn().mockResolvedValue(null) })
  wrap()

  fireEvent.change(screen.getByRole('textbox', { name: /tag name/i }), {
    target: { value: 'design' },
  })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Create tag' }))
  })

  expect(screen.getByText(/could not create tag/i)).toBeInTheDocument()
})

it('does not clear the input when addTag fails', async () => {
  mockContext({ addTag: jest.fn().mockResolvedValue(null) })
  wrap()

  const input = screen.getByRole('textbox', { name: /tag name/i })
  fireEvent.change(input, { target: { value: 'design' } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Create tag' }))
  })

  expect(screen.getByText(/could not create tag/i)).toBeInTheDocument()
  expect(input).toHaveValue('design')
})

// ── Delete ────────────────────────────────────────────────────────────────────

it('calls removeTag with the correct tag id when Delete is clicked', async () => {
  const { removeTag } = mockContext({ tags: [TAG_A, TAG_B] })
  wrap()

  fireEvent.click(screen.getByRole('button', { name: 'Delete frontend' }))

  await waitFor(() => expect(removeTag).toHaveBeenCalledWith(TAG_A.id))
})

it('does not call removeTag for other tags when one is deleted', async () => {
  const { removeTag } = mockContext({ tags: [TAG_A, TAG_B] })
  wrap()

  fireEvent.click(screen.getByRole('button', { name: 'Delete frontend' }))

  await waitFor(() => expect(removeTag).toHaveBeenCalledTimes(1))
  expect(removeTag).not.toHaveBeenCalledWith(TAG_B.id)
})
