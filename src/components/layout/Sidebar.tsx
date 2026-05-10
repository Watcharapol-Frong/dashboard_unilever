'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useSidebar } from '@/context/SidebarContext'
import {
  LayoutDashboard, Phone, ShoppingCart, Package,
  Users, Gift, Upload, Settings, ChevronRight, PanelLeftClose, PanelLeftOpen
} from 'lucide-react'

const NAV_ITEMS = [
  { href: '/overview', label: 'Overview', icon: LayoutDashboard },
  { href: '/telesales', label: 'Telesales', icon: Phone },
  { href: '/sales', label: 'Sales', icon: ShoppingCart },
  { href: '/products', label: 'Products', icon: Package },
  { href: '/leads', label: 'Leads', icon: Users },
  { href: '/incentives', label: 'Incentives', icon: Gift },
]

const ADMIN_ITEMS = [
  { href: '/upload', label: 'Upload Data', icon: Upload },
  { href: '/settings', label: 'Settings', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  const { isOpen, toggle } = useSidebar()

  return (
    <aside
      className={cn(
        'no-print min-h-screen bg-[#003DA6] text-white flex flex-col transition-all duration-300 flex-shrink-0',
        isOpen ? 'w-64' : 'w-16'
      )}
    >
      {/* Logo */}
      <div className={cn('border-b border-white/10 flex items-center', isOpen ? 'p-6' : 'p-4 justify-center')}>
        {isOpen ? (
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-white/60 uppercase tracking-wider mb-1">Makro Pro × Unilever</div>
            <div className="text-lg font-bold">Home Care Dashboard</div>
            <div className="text-xs text-white/50 mt-0.5">Category Manager</div>
          </div>
        ) : (
          <div className="text-white font-bold text-lg">M</div>
        )}
      </div>

      {/* Main Nav */}
      <nav className={cn('flex-1 space-y-1', isOpen ? 'p-4' : 'p-2')}>
        {isOpen && (
          <div className="text-xs font-semibold text-white/40 uppercase tracking-wider px-3 mb-2">Dashboard</div>
        )}
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              title={!isOpen ? label : undefined}
              className={cn(
                'flex items-center gap-3 rounded-lg text-sm font-medium transition-all',
                isOpen ? 'px-3 py-2.5' : 'px-0 py-2.5 justify-center',
                active
                  ? 'bg-white text-[#003DA6] shadow-sm'
                  : 'text-white/75 hover:bg-white/10 hover:text-white'
              )}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              {isOpen && label}
              {isOpen && active && <ChevronRight className="h-3 w-3 ml-auto" />}
            </Link>
          )
        })}

        {isOpen && (
          <div className="text-xs font-semibold text-white/40 uppercase tracking-wider px-3 mt-6 mb-2">Admin</div>
        )}
        {!isOpen && <div className="my-3 border-t border-white/10" />}
        {ADMIN_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href
          return (
            <Link
              key={href}
              href={href}
              title={!isOpen ? label : undefined}
              className={cn(
                'flex items-center gap-3 rounded-lg text-sm font-medium transition-all',
                isOpen ? 'px-3 py-2.5' : 'px-0 py-2.5 justify-center',
                active
                  ? 'bg-white text-[#003DA6] shadow-sm'
                  : 'text-white/75 hover:bg-white/10 hover:text-white'
              )}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              {isOpen && label}
            </Link>
          )
        })}
      </nav>

      {/* Footer / Toggle */}
      <div className={cn('border-t border-white/10', isOpen ? 'p-4' : 'p-2')}>
        <button
          onClick={toggle}
          title={isOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          className={cn(
            'w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/60 hover:bg-white/10 hover:text-white transition-all',
            !isOpen && 'justify-center px-0'
          )}
        >
          {isOpen ? (
            <>
              <PanelLeftClose className="h-4 w-4 flex-shrink-0" />
              <span>Collapse</span>
            </>
          ) : (
            <PanelLeftOpen className="h-4 w-4 flex-shrink-0" />
          )}
        </button>
        {isOpen && <div className="text-xs text-white/30 text-center mt-2">Powered by Makro Team</div>}
      </div>
    </aside>
  )
}
