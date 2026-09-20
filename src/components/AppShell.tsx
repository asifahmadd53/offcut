import { type ReactNode, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { IconChevronLeft, IconHome, IconLayoutGrid, IconSettings } from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/store/auth'

interface AppShellProps {
  title: string
  children: ReactNode
  /** Top-level screens show the tab bar. Others show a back arrow to this route. */
  back?: string
  tab?: 'home' | 'stock' | 'settings'
  headerRight?: ReactNode
  /**
   * Called before navigating away (back arrow or tab bar). Return false to cancel —
   * the caller is then responsible for its own confirmation and for navigating itself
   * once the user decides. Used by Settings to ask about unsaved changes.
   */
  onNavigate?: (to: string) => boolean
  /** Rendered as a sticky bar above the tab bar, e.g. Settings' "Save changes" bar. */
  stickyBar?: ReactNode
}

const tabs = [
  { key: 'home' as const, label: 'Home', icon: IconHome, to: '/' },
  { key: 'stock' as const, label: 'Stock', icon: IconLayoutGrid, to: '/stock' },
  { key: 'settings' as const, label: 'Settings', icon: IconSettings, to: '/settings' },
]

export function AppShell({
  title,
  children,
  back,
  tab,
  headerRight,
  onNavigate,
  stickyBar,
}: AppShellProps) {
  const navigate = useNavigate()
  const emailVerified = useAuth((s) => s.emailVerified)
  const [dismissed, setDismissed] = useState(false)

  const go = (to: string) => {
    if (onNavigate && !onNavigate(to)) return
    navigate(to)
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col px-4 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
      {!emailVerified && !dismissed && (
        <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-warning-bg px-3 py-2 text-[12.5px] text-warning-text">
          <span>Confirm your email so you can reset your password.</span>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss"
            className="flex-none font-semibold"
          >
            ✕
          </button>
        </div>
      )}
      <header className="flex h-14 flex-none items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1">
          {back && (
            <button
              type="button"
              onClick={() => go(back)}
              aria-label="Back"
              className="-ml-2 flex h-10 w-10 flex-none items-center justify-center rounded-lg text-foreground active:scale-[0.98]"
            >
              <IconChevronLeft size={22} />
            </button>
          )}
          <h1 className="truncate text-[18px] font-semibold">{title}</h1>
        </div>
        {headerRight}
      </header>

      <main className="flex-1 pb-6">{children}</main>

      {stickyBar}

      {tab && (
        <nav className="flex flex-none justify-around border-t border-hair border-border pb-[calc(env(safe-area-inset-bottom)+9px)] pt-[9px]">
          {tabs.map(({ key, label, icon: Icon, to }) => (
            <button
              key={key}
              type="button"
              onClick={() => go(to)}
              className={cn(
                'flex flex-col items-center gap-0.5 px-3 py-1 text-[12px]',
                tab === key ? 'text-accent-text font-semibold' : 'text-muted-foreground',
              )}
            >
              <Icon size={22} />
              {label}
            </button>
          ))}
        </nav>
      )}
    </div>
  )
}
