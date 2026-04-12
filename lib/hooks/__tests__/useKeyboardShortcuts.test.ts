/** @jest-environment jsdom */
import { renderHook } from '@testing-library/react'
import { act } from 'react'
import { useKeyboardShortcuts } from '../useKeyboardShortcuts'
import type { ShortcutDef } from '../useKeyboardShortcuts'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fire(
  key: string,
  opts: Partial<{
    metaKey: boolean
    ctrlKey: boolean
    altKey: boolean
    target: HTMLElement
  }> = {},
): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key,
    metaKey: opts.metaKey ?? false,
    ctrlKey: opts.ctrlKey ?? false,
    altKey: opts.altKey ?? false,
    bubbles: true,
    cancelable: true,
  })

  // Dispatch on the target element so that e.target is correctly set.
  // The event bubbles up to document where the listener is registered.
  const dispatchTarget: EventTarget = opts.target ?? document
  dispatchTarget.dispatchEvent(event)
  return event
}

function input(tag: 'INPUT' | 'TEXTAREA' | 'SELECT'): HTMLElement {
  const el = document.createElement(tag.toLowerCase() as 'input' | 'textarea' | 'select')
  document.body.appendChild(el)
  return el
}

function contentEditable(): HTMLElement {
  const el = document.createElement('div')
  el.contentEditable = 'true'
  // jsdom does not implement isContentEditable — stub it so the guard check works.
  Object.defineProperty(el, 'isContentEditable', { get: () => true, configurable: true })
  document.body.appendChild(el)
  return el
}

afterEach(() => {
  // Clean up any appended elements.
  document.body.innerHTML = ''
})

// ── Basic matching ─────────────────────────────────────────────────────────────

it('fires the handler when the key matches', () => {
  const handler = jest.fn()
  renderHook(() => useKeyboardShortcuts([{ key: 'n', handler }]))

  act(() => { fire('n') })

  expect(handler).toHaveBeenCalledTimes(1)
})

it('does not fire when the key does not match', () => {
  const handler = jest.fn()
  renderHook(() => useKeyboardShortcuts([{ key: 'n', handler }]))

  act(() => { fire('m') })

  expect(handler).not.toHaveBeenCalled()
})

it('calls e.preventDefault() when the shortcut matches', () => {
  const handler = jest.fn()
  renderHook(() => useKeyboardShortcuts([{ key: 'n', handler }]))

  let event!: KeyboardEvent
  act(() => { event = fire('n') })

  expect(event.defaultPrevented).toBe(true)
})

// ── Modifier guards ────────────────────────────────────────────────────────────

it('does not fire when metaKey is held but meta is false (default)', () => {
  const handler = jest.fn()
  renderHook(() => useKeyboardShortcuts([{ key: 'n', handler }]))

  act(() => { fire('n', { metaKey: true }) })

  expect(handler).not.toHaveBeenCalled()
})

it('fires when meta: true and metaKey is held', () => {
  const handler = jest.fn()
  renderHook(() => useKeyboardShortcuts([{ key: 'z', meta: true, handler }]))

  act(() => { fire('z', { metaKey: true }) })

  expect(handler).toHaveBeenCalledTimes(1)
})

it('does not fire when meta: true but metaKey is not held', () => {
  const handler = jest.fn()
  renderHook(() => useKeyboardShortcuts([{ key: 'z', meta: true, handler }]))

  act(() => { fire('z') })

  expect(handler).not.toHaveBeenCalled()
})

it('does not fire when ctrlKey is held but ctrl is false (default)', () => {
  const handler = jest.fn()
  renderHook(() => useKeyboardShortcuts([{ key: 'n', handler }]))

  act(() => { fire('n', { ctrlKey: true }) })

  expect(handler).not.toHaveBeenCalled()
})

it('fires when ctrl: true and ctrlKey is held', () => {
  const handler = jest.fn()
  renderHook(() => useKeyboardShortcuts([{ key: 'z', ctrl: true, handler }]))

  act(() => { fire('z', { ctrlKey: true }) })

  expect(handler).toHaveBeenCalledTimes(1)
})

it('does not fire when altKey is held regardless of other settings', () => {
  const handler = jest.fn()
  renderHook(() => useKeyboardShortcuts([{ key: 'n', handler }]))

  act(() => { fire('n', { altKey: true }) })

  expect(handler).not.toHaveBeenCalled()
})

// ── Editable guard (default: true) ────────────────────────────────────────────

it('does not fire when focus is inside INPUT (guardEditable default)', () => {
  const handler = jest.fn()
  renderHook(() => useKeyboardShortcuts([{ key: 'n', handler }]))

  const el = input('INPUT')
  act(() => { fire('n', { target: el }) })

  expect(handler).not.toHaveBeenCalled()
})

it('does not fire when focus is inside TEXTAREA', () => {
  const handler = jest.fn()
  renderHook(() => useKeyboardShortcuts([{ key: 'n', handler }]))

  const el = input('TEXTAREA')
  act(() => { fire('n', { target: el }) })

  expect(handler).not.toHaveBeenCalled()
})

it('does not fire when focus is inside SELECT', () => {
  const handler = jest.fn()
  renderHook(() => useKeyboardShortcuts([{ key: 'n', handler }]))

  const el = input('SELECT')
  act(() => { fire('n', { target: el }) })

  expect(handler).not.toHaveBeenCalled()
})

it('does not fire when focus is inside a contentEditable element', () => {
  const handler = jest.fn()
  renderHook(() => useKeyboardShortcuts([{ key: 'n', handler }]))

  const el = contentEditable()
  act(() => { fire('n', { target: el }) })

  expect(handler).not.toHaveBeenCalled()
})

it('fires in INPUT when guardEditable is false', () => {
  const handler = jest.fn()
  renderHook(() =>
    useKeyboardShortcuts([{ key: 'Escape', guardEditable: false, handler }]),
  )

  const el = input('INPUT')
  act(() => { fire('Escape', { target: el }) })

  expect(handler).toHaveBeenCalledTimes(1)
})

// ── First match wins ───────────────────────────────────────────────────────────

it('only calls the first matching handler and skips subsequent matches', () => {
  const first = jest.fn()
  const second = jest.fn()
  renderHook(() =>
    useKeyboardShortcuts([
      { key: 'n', handler: first },
      { key: 'n', handler: second },
    ]),
  )

  act(() => { fire('n') })

  expect(first).toHaveBeenCalledTimes(1)
  expect(second).not.toHaveBeenCalled()
})

// ── Ref pattern — handlers update without re-registration ────────────────────

it('uses the latest handler after re-render without re-registering the listener', () => {
  const firstHandler = jest.fn()
  const secondHandler = jest.fn()

  let shortcut: ShortcutDef = { key: 'n', handler: firstHandler }
  const { rerender } = renderHook(() => useKeyboardShortcuts([shortcut]))

  // Update the handler by replacing the array — the hook does NOT re-mount.
  shortcut = { key: 'n', handler: secondHandler }
  rerender()

  act(() => { fire('n') })

  expect(firstHandler).not.toHaveBeenCalled()
  expect(secondHandler).toHaveBeenCalledTimes(1)
})

// ── Cleanup ────────────────────────────────────────────────────────────────────

it('removes the listener when the component unmounts', () => {
  const handler = jest.fn()
  const { unmount } = renderHook(() => useKeyboardShortcuts([{ key: 'n', handler }]))

  unmount()

  act(() => { fire('n') })

  expect(handler).not.toHaveBeenCalled()
})
