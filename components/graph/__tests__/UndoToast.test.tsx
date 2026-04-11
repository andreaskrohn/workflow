/** @jest-environment jsdom */
import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { UndoToast } from '../UndoToast'

beforeEach(() => { jest.useFakeTimers() })
afterEach(() => { jest.useRealTimers() })

// ── Rendering ─────────────────────────────────────────────────────────────────

it('renders the message and Undo button', () => {
  render(<UndoToast message="Dependency deleted." onUndo={jest.fn()} onDismiss={jest.fn()} />)

  expect(screen.getByText('Dependency deleted.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument()
})

it('shows a 5 s countdown by default', () => {
  render(<UndoToast message="x" onUndo={jest.fn()} onDismiss={jest.fn()} />)

  expect(screen.getByText('5s')).toBeInTheDocument()
})

it('decrements the countdown every second', () => {
  render(<UndoToast message="x" onUndo={jest.fn()} onDismiss={jest.fn()} />)

  act(() => { jest.advanceTimersByTime(1000) })
  expect(screen.getByText('4s')).toBeInTheDocument()

  act(() => { jest.advanceTimersByTime(1000) })
  expect(screen.getByText('3s')).toBeInTheDocument()
})

// ── onDismiss ─────────────────────────────────────────────────────────────────

it('calls onDismiss after 5 seconds', () => {
  const onDismiss = jest.fn()
  render(<UndoToast message="x" onUndo={jest.fn()} onDismiss={onDismiss} />)

  act(() => { jest.advanceTimersByTime(5000) })

  expect(onDismiss).toHaveBeenCalledTimes(1)
})

it('does not call onDismiss before 5 seconds have elapsed', () => {
  const onDismiss = jest.fn()
  render(<UndoToast message="x" onUndo={jest.fn()} onDismiss={onDismiss} />)

  act(() => { jest.advanceTimersByTime(4999) })

  expect(onDismiss).not.toHaveBeenCalled()
})

it('does not call onDismiss after the component unmounts', () => {
  const onDismiss = jest.fn()
  const { unmount } = render(
    <UndoToast message="x" onUndo={jest.fn()} onDismiss={onDismiss} />,
  )

  unmount()
  act(() => { jest.advanceTimersByTime(5000) })

  expect(onDismiss).not.toHaveBeenCalled()
})

// ── onUndo ────────────────────────────────────────────────────────────────────

it('calls onUndo when the Undo button is clicked and does not call onDismiss', () => {
  const onUndo = jest.fn()
  const onDismiss = jest.fn()
  render(<UndoToast message="x" onUndo={onUndo} onDismiss={onDismiss} />)

  fireEvent.click(screen.getByRole('button', { name: 'Undo' }))

  expect(onUndo).toHaveBeenCalledTimes(1)
  expect(onDismiss).not.toHaveBeenCalled()
})

// ── Callback stability ────────────────────────────────────────────────────────

it('does not restart the countdown when the onDismiss reference changes', () => {
  const first = jest.fn()
  const second = jest.fn()
  const { rerender } = render(
    <UndoToast message="x" onUndo={jest.fn()} onDismiss={first} />,
  )

  act(() => { jest.advanceTimersByTime(3000) }) // 3 s elapsed — 2 s remaining
  expect(screen.getByText('2s')).toBeInTheDocument()

  rerender(<UndoToast message="x" onUndo={jest.fn()} onDismiss={second} />)

  act(() => { jest.advanceTimersByTime(2000) }) // 2 more s — should fire

  expect(second).toHaveBeenCalledTimes(1) // latest ref used
  expect(first).not.toHaveBeenCalled()   // stale ref never called
})

// ── Custom duration ───────────────────────────────────────────────────────────

it('respects a custom duration prop', () => {
  const onDismiss = jest.fn()
  render(
    <UndoToast message="x" onUndo={jest.fn()} onDismiss={onDismiss} duration={3000} />,
  )

  expect(screen.getByText('3s')).toBeInTheDocument()

  act(() => { jest.advanceTimersByTime(3000) })

  expect(onDismiss).toHaveBeenCalledTimes(1)
})
