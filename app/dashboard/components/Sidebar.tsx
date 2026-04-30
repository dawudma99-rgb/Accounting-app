'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  GridIcon, UsersIcon, TaxIcon, ListIcon,
  ReceiptIcon, SettingsIcon,
} from './icons'

const navItems: Array<{
  label: string
  icon: (p: { className?: string }) => React.ReactElement
  href: string | null
}> = [
  { label: 'Dashboard',    icon: GridIcon,     href: '/dashboard'         },
  { label: 'Clients',      icon: UsersIcon,    href: '/dashboard/clients' },
  { label: 'Tax Summary',  icon: TaxIcon,      href: '/dashboard/tax'     },
  { label: 'Transactions', icon: ListIcon,     href: null                 },
  { label: 'Receipts',     icon: ReceiptIcon,  href: null                 },
  { label: 'Settings',     icon: SettingsIcon, href: null                 },
]

export function Sidebar() {
  const pathname = usePathname()

  function isActive(href: string | null): boolean {
    if (!href) return false
    if (href === '/dashboard') return pathname === '/dashboard'
    return pathname.startsWith(href)
  }

  return (
    <aside className="w-60 flex-none bg-slate-900 flex flex-col h-full">
      <div className="px-5 py-5 border-b border-slate-700/60">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded bg-slate-700 flex items-center justify-center flex-none">
            <svg className="w-4.5 h-4.5 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" />
              <path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <p className="text-white text-sm font-semibold leading-tight tracking-tight">TradeLedger</p>
            <p className="text-slate-400 text-xs">Self Assessment</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {navItems.map(({ label, icon: Icon, href }) => {
          const active = isActive(href)
          const className = `w-full flex items-center gap-3 px-3 py-2.5 rounded text-sm font-medium transition-colors ${
            active
              ? 'bg-slate-700 text-white cursor-pointer'
              : href
              ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-200 cursor-pointer'
              : 'text-slate-600 cursor-not-allowed opacity-40'
          }`
          return href ? (
            <Link key={label} href={href} className={className}>
              <Icon className="w-4.5 h-4.5 flex-none" />
              {label}
            </Link>
          ) : (
            <span key={label} className={className}>
              <Icon className="w-4.5 h-4.5 flex-none" />
              {label}
            </span>
          )
        })}
      </nav>

      <div className="px-3 pb-4">
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-slate-800">
          <div className="w-7 h-7 rounded bg-slate-600 flex items-center justify-center text-white text-xs font-bold flex-none">
            DA
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-slate-200 text-xs font-medium truncate">Dawud</p>
            <p className="text-slate-500 text-xs truncate">Sole Trader</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
