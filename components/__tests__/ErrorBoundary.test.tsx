/**
 * @jest-environment jsdom
 */
import React from 'react'
import { render, screen } from '@testing-library/react'
import ErrorBoundary from '../ErrorBoundary'

// Component that unconditionally throws
function Bomb(): never {
  throw new Error('Test explosion')
}

beforeEach(() => {
  // Suppress React's own error output so test output stays clean.
  jest.spyOn(console, 'error').mockImplementation(() => {})
  // jsdom does not include fetch — stub it so componentDidCatch does not throw.
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 204 } as unknown as Response)
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe('ErrorBoundary', () => {
  it('renders children when no error occurs', () => {
    render(
      <ErrorBoundary>
        <p>Safe content</p>
      </ErrorBoundary>,
    )
    expect(screen.getByText('Safe content')).toBeInTheDocument()
  })

  it('renders fallback UI when a child throws', () => {
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    )
    expect(screen.getByText('Something went wrong.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reload/i })).toBeInTheDocument()
  })

  it('does not render fallback when no error occurs', () => {
    render(
      <ErrorBoundary>
        <p>Normal</p>
      </ErrorBoundary>,
    )
    expect(screen.queryByText('Something went wrong.')).not.toBeInTheDocument()
  })

  it('posts to /api/log-error with error metadata when a child throws', () => {
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    )

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/log-error',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const body = JSON.parse(
      (global.fetch as jest.Mock).mock.calls[0][1].body as string,
    )
    expect(body.errorName).toBe('Error')
    expect(body.errorMessage).toBe('Test explosion')
    expect(typeof body.componentStack).toBe('string')
  })
})
