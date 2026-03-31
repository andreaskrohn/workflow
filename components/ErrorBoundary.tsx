'use client'

import React from 'react'

interface Props {
  children: React.ReactNode
}

interface State {
  hasError: boolean
}

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Fire-and-forget. No user content is sent — only technical error metadata.
    fetch('/api/log-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        errorName: error.name,
        errorMessage: error.message,
        componentStack: info.componentStack,
      }),
    }).catch(() => {
      // Intentionally silent — a logging failure must not cause secondary errors.
    })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4">
          <p className="text-lg">Something went wrong.</p>
          <button
            onClick={() => window.location.reload()}
            className="rounded bg-gray-700 px-4 py-2 text-sm hover:bg-gray-600"
          >
            Reload
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
