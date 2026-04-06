/** @jest-environment jsdom */
import React from 'react'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock CSRF so we control the token
jest.mock('@/lib/middleware/csrf', () => ({
  getCsrfToken: jest.fn().mockResolvedValue('test-token'),
}))

import { BackupPrompt } from '../BackupPrompt'

function mockFetch(responses: Record<string, unknown>) {
  global.fetch = jest.fn().mockImplementation((url: string) => {
    const key = Object.keys(responses).find((k) => url.includes(k))
    if (!key) return Promise.resolve({ ok: false })
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(responses[key]),
    })
  }) as jest.Mock
}

afterEach(() => {
  jest.clearAllMocks()
})

describe('BackupPrompt', () => {
  it('renders nothing when backup is not needed', async () => {
    mockFetch({ '/api/backup/status': { needed: false, last_backup_at: Date.now() / 1000 } })
    const { container } = render(<BackupPrompt />)
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/backup/status'))
    expect(container.firstChild).toBeNull()
  })

  it('renders the banner when backup is needed', async () => {
    mockFetch({ '/api/backup/status': { needed: true, last_backup_at: null } })
    render(<BackupPrompt />)
    await waitFor(() => screen.getByRole('alertdialog'))
    expect(screen.getByText(/no recent backup found/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /back up/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /not now/i })).toBeInTheDocument()
  })

  it('"Not now" dismisses the banner', async () => {
    mockFetch({ '/api/backup/status': { needed: true, last_backup_at: null } })
    render(<BackupPrompt />)
    await waitFor(() => screen.getByRole('alertdialog'))
    await userEvent.click(screen.getByRole('button', { name: /not now/i }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('"Back up" calls POST /api/backup and dismisses the banner', async () => {
    mockFetch({
      '/api/backup/status': { needed: true, last_backup_at: null },
      '/api/backup': { message: 'Backup started.' },
    })
    render(<BackupPrompt />)
    await waitFor(() => screen.getByRole('alertdialog'))
    await userEvent.click(screen.getByRole('button', { name: /back up/i }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/backup',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('"Back up" sends the CSRF token', async () => {
    mockFetch({
      '/api/backup/status': { needed: true, last_backup_at: null },
      '/api/backup': { message: 'Backup started.' },
    })
    render(<BackupPrompt />)
    await waitFor(() => screen.getByRole('alertdialog'))
    await userEvent.click(screen.getByRole('button', { name: /back up/i }))

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/backup',
        expect.objectContaining({
          headers: expect.objectContaining({ 'X-CSRF-Token': 'test-token' }),
        }),
      ),
    )
  })

  it('shows "Backing up…" while the request is in flight', async () => {
    let resolveBackup!: () => void
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes('/api/backup/status')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ needed: true, last_backup_at: null }) })
      }
      // Hold the backup request open
      return new Promise<{ ok: boolean; json: () => Promise<unknown> }>((resolve) => {
        resolveBackup = () => resolve({ ok: true, json: () => Promise.resolve({ message: 'Backup started.' }) })
      })
    }) as jest.Mock

    render(<BackupPrompt />)
    await waitFor(() => screen.getByRole('alertdialog'))
    await userEvent.click(screen.getByRole('button', { name: /back up/i }))
    expect(screen.getByText(/backing up/i)).toBeInTheDocument()

    // Resolve the pending request
    await act(async () => resolveBackup())
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
  })

  it('dismisses even if the backup request fails', async () => {
    mockFetch({ '/api/backup/status': { needed: true, last_backup_at: null } })
    // Backup request throws
    ;(global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/api/backup/status')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ needed: true, last_backup_at: null }) })
      }
      return Promise.reject(new Error('network error'))
    })

    render(<BackupPrompt />)
    await waitFor(() => screen.getByRole('alertdialog'))
    await userEvent.click(screen.getByRole('button', { name: /back up/i }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
  })
})
