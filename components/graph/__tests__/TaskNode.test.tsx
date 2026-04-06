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

const noop = () => {}

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
      description: null,
      status: 'todo' as const,
      priority: 3,
      due_date: null,
      defer_date: null,
      isEvaluating: false,
      isEnabled: true,
      onToggle: noop,
      onAddConnected: noop,
      onAddBefore: noop,
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

  it('enabled state: data-state="enabled" for todo status when enabled', () => {
    const { container } = render(<TaskNode {...makeProps({ status: 'todo', isEnabled: true })} />)
    expect(container.querySelector('[data-state="enabled"]')).not.toBeNull()
  })

  it('disabled state: data-state="disabled" for todo when not enabled (deps not done)', () => {
    const { container } = render(<TaskNode {...makeProps({ status: 'todo', isEnabled: false })} />)
    expect(container.querySelector('[data-state="disabled"]')).not.toBeNull()
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

  it('isEvaluating takes precedence over status', () => {
    const { container } = render(<TaskNode {...makeProps({ status: 'done', isEvaluating: true })} />)
    expect(container.querySelector('[data-state="disabled"]')).not.toBeNull()
    expect(container.querySelector('[data-state="completed"]')).toBeNull()
  })

  it('applies pointer-events: none to wrapper when isEvaluating', () => {
    const { container } = render(<TaskNode {...makeProps({ isEvaluating: true })} />)
    const node = container.firstChild as HTMLElement
    expect(node.style.pointerEvents).toBe('none')
  })

  it('does not apply pointer-events: none to wrapper when not evaluating', () => {
    const { container } = render(<TaskNode {...makeProps({ isEvaluating: false })} />)
    const node = container.firstChild as HTMLElement
    expect(node.style.pointerEvents).not.toBe('none')
  })

  it('checkbox button always has pointer-events: auto', () => {
    const { container } = render(<TaskNode {...makeProps({ isEvaluating: true })} />)
    const btn = container.querySelector('button') as HTMLElement
    expect(btn.style.pointerEvents).toBe('auto')
  })

  it('renders description preview when description is short', () => {
    render(<TaskNode {...makeProps({ description: 'Short description' })} />)
    expect(screen.getByText('Short description')).toBeInTheDocument()
  })

  it('truncates description longer than 100 chars', () => {
    const long = 'a'.repeat(110)
    render(<TaskNode {...makeProps({ description: long })} />)
    expect(screen.getByText('a'.repeat(100) + '…')).toBeInTheDocument()
  })

  it('renders no description preview when description is null', () => {
    const { container } = render(<TaskNode {...makeProps({ description: null, due_date: null })} />)
    // Only one <p> element (the title) when no description and no due date
    const paragraphs = container.querySelectorAll('p')
    expect(paragraphs).toHaveLength(1)
  })

  it('checkbox is checked (has SVG) when status is done', () => {
    const { container } = render(<TaskNode {...makeProps({ status: 'done' })} />)
    expect(container.querySelector('button svg')).not.toBeNull()
  })

  it('checkbox is unchecked (no SVG) when status is todo', () => {
    const { container } = render(<TaskNode {...makeProps({ status: 'todo' })} />)
    expect(container.querySelector('button svg')).toBeNull()
  })
})
