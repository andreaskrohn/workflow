'use client'

// ── FROZEN after Phase 1 ──────────────────────────────────────────────────────
// Do NOT modify this file. Provider order and children prop are contractual.

import React from 'react'
import { CsrfProvider } from '@/lib/csrf-context'
import { ToastProvider } from '@/components/shared/ToastProvider'
import { TagContextProvider } from '@/components/tags/TagContext'

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <CsrfProvider>
      <ToastProvider>
        <TagContextProvider>{children}</TagContextProvider>
      </ToastProvider>
    </CsrfProvider>
  )
}
