'use client'

import React, { createContext, useCallback, useContext, useState } from 'react'

interface Toast {
  id: string
  message: string
}

interface ToastContextValue {
  /** Display a toast notification for 4 seconds. */
  showToast: (message: string) => void
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} })

/** Provides {@link useToast} to the client tree and renders the toast overlay. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const showToast = useCallback((message: string) => {
    const id = Math.random().toString(36).slice(2)
    setToasts((prev) => [...prev, { id, message }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 4000)
  }, [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className="rounded bg-gray-700 px-4 py-2 text-sm text-white shadow-lg"
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

/** Returns `{ showToast }` for displaying transient notifications. */
export function useToast(): ToastContextValue {
  return useContext(ToastContext)
}
