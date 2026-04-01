/** @jest-environment jsdom */
import React from 'react'
import { render, screen } from '@testing-library/react'
import { Position } from 'reactflow'

// Mock reactflow to avoid the zustand provider requirement in unit tests.
// Handle is a pure connector UI element — not relevant to visual state tests.
jest.mock('reactflow', () => ({
  Handle: () => null,
  Position: { Left: 'left', Right: 'right' },
}))

import { TaskNode } from '../TaskNode'
import type { TaskNodeData } from '../TaskNode'

// ReactFlow injects NodeProps — we only need data + selected for visual state tests.
function makeProps(overrides: Partial<TaskNodeData> = {}, selected = false) {
  return {
    id: 'task-1',
    type: 'taskNode',
    selected,
    dragging: false,
    zIndex: 1,
    isConnectable: true,
    xPos: 0,
    yPos: 0,
    data: {
      id: 'task-1',
      title: 'Test task',
      status: 'todo' as const,
      priority: 3,
      isEvaluating: false,
      ...overrides,
    },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
  }
}

describe('TaskNode visual states', () => {
  it('renders the task title', () => {
    render(<TaskNode {...makeProps()} />)
    expect(screen.getByText('Test task')).toBeInTheDocument()
  })

  it('enabled state: data-state="enabled" for todo status', () => {
    const { container } = render(<TaskNode {...makeProps({ status: 'todo' })} />)
    expect(container.querySelector('[data-state="enabled"]')).not.toBeNull()
  })

  it('enabled state: data-state="enabled" for in_progress status', () => {
    const { container } = render(<TaskNode {...makeProps({ status: 'in_progress' })} />)
    expect(container.querySelector('[data-state="enabled"]')).not.toBeNull()
  })

  it('completed state: data-state="completed" for done status', () => {
    const { container } = render(<TaskNode {...makeProps({ status: 'done' })} />)
    expect(container.querySelector('[data-state="completed"]')).not.toBeNull()
  })

  it('deferred state: data-state="deferred" for blocked status', () => {
    const { container } = render(<TaskNode {...makeProps({ status: 'blocked' })} />)
    expect(container.querySelector('[data-state="deferred"]')).not.toBeNull()
  })

  it('disabled state: data-state="disabled" when isEvaluating is true', () => {
    const { container } = render(<TaskNode {...makeProps({ isEvaluating: true })} />)
    expect(container.querySelector('[data-state="disabled"]')).not.toBeNull()
  })

  it('disabled state takes precedence over status when isEvaluating', () => {
    // Even a "done" task should show disabled state during evaluation
    const { container } = render(<TaskNode {...makeProps({ status: 'done', isEvaluating: true })} />)
    expect(container.querySelector('[data-state="disabled"]')).not.toBeNull()
    expect(container.querySelector('[data-state="completed"]')).toBeNull()
  })

  it('applies pointer-events: none when isEvaluating', () => {
    const { container } = render(<TaskNode {...makeProps({ isEvaluating: true })} />)
    const node = container.firstChild as HTMLElement
    expect(node.style.pointerEvents).toBe('none')
  })

  it('does not apply pointer-events: none when not evaluating', () => {
    const { container } = render(<TaskNode {...makeProps({ isEvaluating: false })} />)
    const node = container.firstChild as HTMLElement
    expect(node.style.pointerEvents).not.toBe('none')
  })
})
