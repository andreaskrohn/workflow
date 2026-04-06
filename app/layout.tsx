// Side-effect import: registers node-cron scheduler once per process.
// Must be first — node-cron and child_process are Node.js-only; this file
// stays a Server Component so they are never bundled for the client.
import '@/lib/scheduler'

import type { Metadata } from 'next'
import localFont from 'next/font/local'
import './globals.css'
import ErrorBoundary from '@/components/ErrorBoundary'
import Providers from '@/components/Providers'
import Sidebar from '@/components/Sidebar'
import { BackupPrompt } from '@/components/shared/BackupPrompt'

const geistSans = localFont({
  src: './fonts/GeistVF.woff',
  variable: '--font-geist-sans',
  weight: '100 900',
})
const geistMono = localFont({
  src: './fonts/GeistMonoVF.woff',
  variable: '--font-geist-mono',
  weight: '100 900',
})

export const metadata: Metadata = {
  title: 'Workflow',
  description: 'Personal task and dependency manager',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gray-950 text-gray-100`}
      >
        <ErrorBoundary>
          <Providers>
            <div className="flex h-screen overflow-hidden">
              <Sidebar />
              <main className="flex-1 overflow-auto p-6">{children}</main>
            </div>
            <BackupPrompt />
          </Providers>
        </ErrorBoundary>
      </body>
    </html>
  )
}
