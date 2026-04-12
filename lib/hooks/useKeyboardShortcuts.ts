import { useEffect, useRef } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ShortcutDef {
  /** Key value to match (e.g. `'n'`, `'z'`, `'1'`, `'Escape'`). */
  key: string
  /**
   * When `true`, the shortcut fires only if the Meta key (Cmd on macOS) is
   * held. When `false` (default), the shortcut does **not** fire if Meta is
   * held.
   */
  meta?: boolean
  /**
   * When `true`, the shortcut fires only if the Ctrl key is held. When
   * `false` (default), the shortcut does **not** fire if Ctrl is held.
   */
  ctrl?: boolean
  /**
   * When `true` (default), the shortcut is suppressed while keyboard focus
   * is inside an `INPUT`, `TEXTAREA`, `SELECT`, or `contentEditable`
   * element, preventing interference with normal text editing.
   *
   * Set to `false` for shortcuts that must fire regardless of focus (e.g.
   * `Escape` closing a modal whose input has focus).
   */
  guardEditable?: boolean
  handler: () => void
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Attaches a single stable `keydown` listener to `document` and dispatches
 * matching events to the appropriate handler.
 *
 * Handlers are read from a ref on every event, so callers can pass a
 * fresh `shortcuts` array each render (e.g. one built with `useMemo` or
 * inline) without triggering listener re-registration.
 *
 * Only the **first** matching shortcut in the array is executed; subsequent
 * matches are skipped. Call `e.preventDefault()` is automatic.
 *
 * Alt-key combos are always ignored unless the caller explicitly matches
 * them via a custom guard (Alt is not modelled as a first-class option here).
 */
export function useKeyboardShortcuts(shortcuts: ShortcutDef[]): void {
  // Always keep the ref in sync so the stable listener sees the latest array.
  const ref = useRef<ShortcutDef[]>(shortcuts)
  useEffect(() => {
    ref.current = shortcuts
  })

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      for (const {
        key,
        meta = false,
        ctrl = false,
        guardEditable = true,
        handler,
      } of ref.current) {
        if (e.key !== key) continue
        if (meta !== e.metaKey) continue
        if (ctrl !== e.ctrlKey) continue
        // Skip any alt-modified combination unless the shortcut is specifically
        // designed for it (which none of ours are — alt handling is left to the
        // browser).
        if (e.altKey) continue

        if (guardEditable) {
          const target = e.target as HTMLElement
          const tag = target.tagName
          if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') continue
          if (target.isContentEditable) continue
        }

        e.preventDefault()
        handler()
        return // first match wins
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, []) // stable listener; reads shortcuts via ref
}
