'use client'

import type { View } from '../types'
import {
  GridIcon, UsersIcon, TaxIcon, ListIcon,
  ReceiptIcon, SettingsIcon,
} from './icons'

export function Sidebar({
  currentView,
  onNavigate,
}: {
  currentView: View
  onNavigate: (view: View) => void
}) {
  const navItems: Array<{
    label: string
    icon: (p: { className?: string }) => React.ReactElement
    view: View | null
  }> = [
    { label: 'Dashboard',    icon: GridIcon,     view: 'dashboard' },
    { label: 'Clients',      icon: UsersIcon,    view: 'clients'   },
    { label: 'Tax Summary',  icon: TaxIcon,      view: 'tax'       },
    { label: 'Transactions', icon: ListIcon,     view: null        },
    { label: 'Receipts',     icon: ReceiptIcon,  view: null        },
    { label: 'Settings',     icon: SettingsIcon, view: null        },
  ]

  // Clients nav item stays highlighted when viewing a client's detail
  function isActive(view: View | null): boolean {
    if (view === null) return false
    if (view === 'clients') return currentView === 'clients' || currentView === 'client-detail'
    return currentView === view
  }

  return (
    <aside className="w-60 flex-none bg-slate-900 flex flex-col h-full">
      <div className="px-5 py-5 border-b border-slate-700/60">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center flex-none">
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
        {navItems.map(({ label, icon: Icon, view }) => (
          <button
            key={label}
            onClick={() => view && onNavigate(view)}
            disabled={!view}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              isActive(view)
                ? 'bg-indigo-600 text-white cursor-pointer'
                : view
                ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-200 cursor-pointer'
                : 'text-slate-600 cursor-not-allowed opacity-40'
            }`}
          >
            <Icon className="w-4.5 h-4.5 flex-none" />
            {label}
          </button>
        ))}
      </nav>

      <div className="px-3 pb-4">
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-slate-800">
          <div className="w-7 h-7 rounded-full bg-indigo-500 flex items-center justify-center text-white text-xs font-bold flex-none">
            JD
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-slate-200 text-xs font-medium truncate">John Davies</p>
            <p className="text-slate-500 text-xs truncate">Sole Trader</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
