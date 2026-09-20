import { type ReactNode, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  IconChevronLeft,
  IconHome,
  IconLayoutGrid,
  IconLogout,
  IconScissors,
  IconSettings,
} from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/store/auth'
import { useData } from '@/store/data'
import { SyncBadge } from '@/components/SyncBadge'
import { Button } from './ui/button'

interface AppShellProps {
  title: string
  children: ReactNode
  /** Top-level screens show the tab bar / rail / sidebar highlighted on `tab`. */
  back?: string
  tab?: 'home' | 'stock' | 'settings'
  /**
   * For non-top-level screens (New job, Plan, Job detail, Leftover detail, Sync
   * check) the sidebar/rail still stays visible and highlights this parent item,
   * even though the screen itself shows a back button in its header.
   */
  parentTab?: 'home' | 'stock' | 'settings'
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
  { key: 'stock' as const, label: 'Leftover stock', icon: IconLayoutGrid, to: '/stock' },
  { key: 'settings' as const, label: 'Settings', icon: IconSettings, to: '/settings' },
]

export function AppShell({
  title,
  children,
  back,
  tab,
  parentTab,
  headerRight,
  onNavigate,
  stickyBar,
}: AppShellProps) {
  const navigate = useNavigate()
  const emailVerified = useAuth((s) => s.emailVerified)
  const email = useAuth((s) => s.email)
  const logout = useAuth((s) => s.logout)
  const derived = useData((s) => s.derived)
  const [dismissed, setDismissed] = useState(false)

  // Root cause of the "tabs missing on laptop" bug (see CLAUDE.md C13): the old shell
  // wrapped header + main + tab bar in one `max-w-[480px] mx-auto` column with no
  // breakpoint variants, so at laptop width it rendered as a narrow centred strip with
  // large empty margins either side. The tab bar was technically present but invisible
  // as "navigation" to the user. Fix: three real structural tiers below 768 / 768-1023 /
  // 1024+, each a sibling in the flex layout — never `position: fixed`.
  const activeKey = tab ?? parentTab
  const conflictCount = derived.conflicts.length

  const go = (to: string) => {
    if (onNavigate && !onNavigate(to)) return
    navigate(to)
  }

  const verifyBanner = !emailVerified && !dismissed && (
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
  )

  return (
    <div className="flex h-dvh w-full overflow-hidden">
      {/* 1024px+: persistent left sidebar */}
      <aside className="hidden w-60 flex-none flex-col overflow-y-auto border-r border-hair border-border bg-card px-4 py-5 lg:flex">
        <div className="mb-6 flex items-center gap-2 px-1">
          <div className="flex h-9 w-9 flex-none items-center justify-center rounded-[12px] bg-brand text-brand-fg">
            <IconScissors size={18} />
          </div>
          <span className="text-[17px] font-semibold">Offcut</span>
        </div>

        <Button
          type="button"
          onClick={() => go('/new')}
          className="mb-5 flex items-center justify-center rounded-lg bg-brand text-[15px] font-semibold text-brand-fg  active:scale-[0.98]"
        >
          + New cutting job
        </Button>

        <nav className="flex flex-1 flex-col gap-1">
          {tabs.map(({ key, label, icon: Icon, to }) => (
            <button
              key={key}
              type="button"
              onClick={() => go(to)}
              className={cn(
                'relative flex h-11 items-center gap-3 rounded-[12px] px-3 text-[14.5px] transition-colors',
                activeKey === key
                  ? 'bg-brand-tint font-semibold text-brand-ink'
                  : 'text-muted-foreground hover:bg-muted',
              )}
            >
              <Icon size={20} />
              {label}
              {key === 'home' && conflictCount > 0 && (
                <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-danger-text px-1 text-[11px] font-semibold text-white">
                  {conflictCount}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="mt-4 flex flex-col gap-2  border-border pt-4">
          <SyncBadge />
          {email && <p className="truncate px-1 text-[12px] text-muted-foreground">{email}</p>}
          <Button
            type="button"
            onClick={() => logout()}
            className="flex h-9 bg-red-800 items-center gap-2 rounded-[10px] px-1 text-[13px] text-foreground hover:text-foreground"
          >
            <IconLogout size={16} />
            Log out
          </Button>
        </div>
      </aside>

      {/* 768-1023px: slim icon rail */}
      <nav className="hidden w-[72px] flex-none flex-col items-center gap-1 overflow-y-auto border-r border-hair border-border bg-card py-5 md:flex lg:hidden">
        <div className="mb-5 flex h-9 w-9 items-center justify-center rounded-[12px] bg-brand text-brand-fg">
          <IconScissors size={18} />
        </div>
        {tabs.map(({ key, label, icon: Icon, to }) => (
          <button
            key={key}
            type="button"
            onClick={() => go(to)}
            aria-label={label}
            className={cn(
              'relative flex w-14 flex-col items-center gap-0.5 rounded-[12px] py-2 text-[10.5px] transition-colors',
              activeKey === key
                ? 'bg-brand-tint font-semibold text-brand-ink'
                : 'text-muted-foreground hover:bg-muted',
            )}
          >
            <Icon size={20} />
            {key === 'home' && conflictCount > 0 && (
              <span className="absolute right-2 top-1 h-2 w-2 rounded-full bg-danger-text" />
            )}
          </button>
        ))}
      </nav>

      {/* Main column: header + scrolling content + (phone) floating tab bar */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-brand focus:px-3 focus:py-2 focus:text-sm focus:text-brand-fg"
        >
          Skip to content
        </a>
        <div className="mx-auto flex min-h-0 w-full flex-1 flex-col px-5 pt-[env(safe-area-inset-top)] lg:px-8">
          {verifyBanner}
          <header className="flex h-14 flex-none items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1">
              {back && (
                <button
                  type="button"
                  onClick={() => go(back)}
                  aria-label="Back"
                  className="-ml-2 flex h-10 w-10 flex-none items-center justify-center rounded-full text-foreground hover:bg-muted active:scale-[0.98]"
                >
                  <IconChevronLeft size={22} />
                </button>
              )}
              <h1 className="truncate text-[20px] font-semibold">{title}</h1>
            </div>
            <div className="flex items-center gap-2 md:hidden lg:hidden">{headerRight}</div>
          </header>

          <main id="main-content" className="min-h-0 flex-1 overflow-y-auto pb-6">
            {children}
          </main>

          {stickyBar}
        </div>

        {/* Under 768px: floating inset bottom tab bar (structural sibling, not fixed) */}
        {tab && (
          <nav
            className="mx-4 mb-[calc(env(safe-area-inset-bottom)+12px)] flex flex-none justify-around rounded-[24px] border-hair border-border bg-card px-2 py-2 shadow-elevated md:hidden"
            aria-label="Primary"
          >
            {tabs.map(({ key, label, icon: Icon, to }) => (
              <button
                key={key}
                type="button"
                onClick={() => go(to)}
                aria-label={label}
                className={cn(
                  'relative flex flex-col items-center gap-0.5 rounded-[18px] px-4 py-1.5 text-[11.5px] transition-colors',
                  tab === key
                    ? 'bg-brand-tint font-semibold text-brand-ink'
                    : 'text-muted-foreground',
                )}
              >
                <Icon size={21} />
                {key === 'home' ? 'Home' : key === 'stock' ? 'Stock' : 'Settings'}
                {key === 'home' && conflictCount > 0 && (
                  <span className="absolute right-2 top-0.5 h-2 w-2 rounded-full bg-danger-text" />
                )}
              </button>
            ))}
          </nav>
        )}
      </div>
    </div>
  )
}
