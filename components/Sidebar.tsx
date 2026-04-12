'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCsrf } from '@/lib/csrf-context'
import { useToast } from '@/components/shared/ToastProvider'
import { SearchBar } from '@/components/shared/SearchBar'

const NAV_LINKS = [
  { href: '/inbox', label: 'Inbox' },
  { href: '/now', label: 'Now' },
  { href: '/today', label: 'Today' },
  { href: '/graph', label: 'Graph' },
  { href: '/tags', label: 'Tags' },
  { href: '/review', label: 'Review' },
  { href: '/log', label: 'Log' },
] as const

export default function Sidebar() {
  const pathname = usePathname()
  const { token } = useCsrf()
  const { showToast } = useToast()

  async function handleBackup() {
    if (!token) return
    try {
      const res = await fetch('/api/backup', {
        method: 'POST',
        headers: { 'X-CSRF-Token': token },
      })
      const data = (await res.json()) as { message?: string }
      showToast(data.message ?? 'Backup started.')
    } catch {
      showToast('Backup request failed.')
    }
  }

  return (
    <aside className="flex h-screen w-48 shrink-0 flex-col border-r border-gray-800 bg-gray-900 p-4">
      <SearchBar />
      <nav className="flex flex-1 flex-col gap-1">
        {NAV_LINKS.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className={`rounded px-3 py-2 text-sm transition-colors ${
              pathname === href
                ? 'bg-gray-700 text-white'
                : 'text-gray-400 hover:bg-gray-800 hover:text-white'
            }`}
          >
            {label}
          </Link>
        ))}
      </nav>
      <button
        onClick={handleBackup}
        disabled={!token}
        className="mt-4 rounded bg-gray-700 px-3 py-2 text-sm text-white transition-colors hover:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Backup Now
      </button>
    </aside>
  )
}
