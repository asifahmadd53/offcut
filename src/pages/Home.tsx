import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { IconLayoutGrid } from '@tabler/icons-react'
import { AppShell } from '@/components/AppShell'
import { SyncBadge } from '@/components/SyncBadge'
import { Button } from '@/components/ui/button'
import { dayMonth } from '@/lib/format'
import { pieceSummary, sourceSummary } from '@/lib/summary'
import { useData } from '@/store/data'
import { useJob } from '@/store/job'

export default function Home() {
  const navigate = useNavigate()
  const derived = useData((s) => s.derived)
  const setOnlyLeftoverId = useJob((s) => s.setOnlyLeftoverId)
  const setForceNewSheet = useJob((s) => s.setForceNewSheet)
  const listRef = useRef<HTMLDivElement>(null)
  const [atBottom, setAtBottom] = useState(false)

  function onListScroll() {
    const el = listRef.current
    if (!el) return
    const overflowing = el.scrollHeight > el.clientHeight + 1
    setAtBottom(!overflowing || el.scrollHeight - el.scrollTop - el.clientHeight < 4)
  }

  const freeCount = derived.freeLeftovers.length
  const now = new Date()
  const jobsThisMonth = derived.jobs.filter((j) => {
    const d = new Date(j.cut.createdAt)
    return (
      (j.status === 'active' || j.status === 'kept') &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear()
    )
  }).length
  const recent = derived.jobs.slice(0, 30)
  const conflictCount = derived.conflicts.length
  const firstUse = derived.jobs.length === 0 && derived.freeLeftovers.length === 0

  useEffect(() => {
    onListScroll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recent.length])

  function startNewJob() {
    setOnlyLeftoverId(null)
    setForceNewSheet(false)
    navigate('/new')
  }

  return (
    <AppShell title="Offcut" tab="home" headerRight={<SyncBadge />}>
      {conflictCount > 0 && (
        <div className="mb-3.5 rounded-[10px] bg-danger-bg p-3.5">
          <p className="mb-1 text-[15px] font-semibold text-danger-text">
            {conflictCount === 1 ? '1 job needs your answer' : `${conflictCount} jobs need your answer`}
          </p>
          <p className="mb-2.5 text-[13.5px] text-danger-text">
            A leftover was used on another phone too.
          </p>
          <button
            type="button"
            onClick={() => navigate('/sync-check')}
            className="flex h-10 w-full items-center justify-center rounded-lg bg-danger-text text-[14px] font-semibold text-white"
          >
            Check it now
          </button>
        </div>
      )}

      {firstUse ? (
        <div className="py-6 text-center">
          <div className="mx-auto mb-3 flex h-13 w-13 items-center justify-center rounded-xl bg-muted text-faint">
            <IconLayoutGrid size={26} />
          </div>
          <p className="mb-1 text-[17px] font-semibold">No cuts yet</p>
          <p className="mx-auto mb-5 max-w-[34ch] text-[13px] text-muted-foreground">
            Start your first job, or add the offcuts already standing in the workshop.
          </p>
          <Button size="hero" className="mb-2.5 w-full rounded-none" onClick={startNewJob}>
            + New cutting job
          </Button>
          <Button variant="outline" className="h-12 w-full" onClick={() => navigate('/stock/add')}>
            Add leftover by hand
          </Button>
        </div>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => navigate('/stock')}
              className="rounded-lg bg-muted p-3 text-left"
            >
              <p className="mb-0 text-[13px] text-muted-foreground">Saved leftovers</p>
              <p className="mb-0 font-sans text-[24px] font-semibold">{freeCount}</p>
            </button>
            <div className="rounded-lg bg-muted p-3">
              <p className="mb-0 text-[13px] text-muted-foreground">Jobs this month</p>
              <p className="mb-0 font-sans text-[24px] font-semibold">{jobsThisMonth}</p>
            </div>
          </div>

          <Button size="lg" className="mb-2.5 w-full" onClick={startNewJob}>
            + New cutting job
          </Button>
          <Button size="lg" variant="outline" className="mb-4.5 w-full " onClick={() => navigate('/stock')}>
            Leftover stock
          </Button>

          {recent.length > 0 && (
            <>
              <p className="mb-1 flex-none text-[13px] mt-4 text-muted-foreground">Recent jobs</p>
              <div className="relative">
                <div
                  ref={listRef}
                  onScroll={onListScroll}
                  className="thin-scroll overflow-y-auto overscroll-contain pr-1.5"
                  style={{
                    maxHeight: 'max(50vh, 220px)',
                    WebkitOverflowScrolling: 'touch',
                    scrollbarWidth: 'thin',
                  }}
                >
                  {recent.map((j) => (
                    <button
                      key={j.cut.id}
                      type="button"
                      onClick={() => navigate(`/job/${j.cut.id}`)}
                      className="flex w-full items-center justify-between border-b p-4 rounded-md mb-2 border-hair border-border py-2.5 text-left"
                    >
                      <div>
                        <p className="mb-0 flex items-center gap-1.5 text-[15px] font-semibold">
                          {pieceSummary(j.cut.pieces)}
                          {j.status === 'conflict' && (
                            <span className="h-1.5 w-1.5 flex-none rounded-full bg-warning-border" />
                          )}
                        </p>
                        <p className="mb-0 text-[13px] text-muted-foreground">
                          {j.cut.clientName ? `${j.cut.clientName} · ` : ''}
                          {dayMonth(j.cut.createdAt)} · {sourceSummary(j.cut.sheets)}
                        </p>
                      </div>
                      <span className="text-faint">›</span>
                    </button>
                  ))}
                </div>
                {!atBottom && (
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-background to-transparent" />
                )}
              </div>
            </>
          )}
        </>
      )}
    </AppShell>
  )
}
