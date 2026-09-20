import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { IconLayoutGrid } from '@tabler/icons-react'
import { AppShell } from '@/components/AppShell'
import { SyncBadge } from '@/components/SyncBadge'
import { Button } from '@/components/ui/button'
import { dayMonth } from '@/lib/format'
import { fmtLeft } from '@/lib/inches'
import { useData } from '@/store/data'
import type { Leftover } from '@/lib/types'

function originText(l: Leftover): string {
  if (l.manual) return `Added by hand · ${dayMonth(l.createdAt)}`
  return `${l.letter} · from ${dayMonth(l.sheetDate)} sheet`
}

export default function Stock() {
  const navigate = useNavigate()
  const derived = useData((s) => s.derived)
  const listRef = useRef<HTMLDivElement>(null)
  const [atBottom, setAtBottom] = useState(false)

  const sorted = [...derived.freeLeftovers].sort((a, b) => b.w * b.h - a.w * a.h)
  const totalArea = sorted.reduce((sum, l) => sum + l.w * l.h, 0)

  function onListScroll() {
    const el = listRef.current
    if (!el) return
    const overflowing = el.scrollHeight > el.clientHeight + 1
    setAtBottom(!overflowing || el.scrollHeight - el.scrollTop - el.clientHeight < 4)
  }

  useEffect(() => {
    onListScroll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sorted.length])

  return (
    <AppShell title="Leftover stock" tab="stock" headerRight={<SyncBadge />}>
      {sorted.length === 0 ? (
        <div className="py-6 text-center">
          <div className="mx-auto mb-3 flex h-13 w-13 items-center justify-center rounded-xl bg-muted text-faint">
            <IconLayoutGrid size={26} />
          </div>
          <p className="mb-1 text-[17px] font-semibold">No leftovers saved yet</p>
          <p className="mx-auto mb-5 max-w-[34ch] text-[13px] text-muted-foreground">
            Leftovers from your cuts are saved here.
          </p>
          <Button size="hero" className="mb-2.5 w-full" onClick={() => navigate('/new')}>
            + New cutting job
          </Button>
          <Button variant="outline" className="h-12 w-full" onClick={() => navigate('/stock/add')}>
            Add leftover by hand
          </Button>
        </div>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-muted p-3">
              <p className="mb-0 text-[13px] text-muted-foreground">Pieces</p>
              <p className="mb-0 font-sans text-[24px] font-semibold">{sorted.length}</p>
            </div>
            <div className="rounded-lg bg-muted p-3">
              <p className="mb-0 text-[13px] text-muted-foreground">Free area</p>
              <p className="mb-0 font-sans text-[24px] font-semibold">
                {Math.round(totalArea).toLocaleString()}{' '}
                <span className="text-[13px] font-normal text-muted-foreground">sq in</span>
              </p>
            </div>
          </div>

          <p className="mb-0.5 text-[13px] text-muted-foreground">Biggest first</p>
          <div className="relative">
            <div
              ref={listRef}
              onScroll={onListScroll}
              className="thin-scroll overflow-y-auto overscroll-contain"
              style={{
                maxHeight: 'max(40vh, 220px)',
                WebkitOverflowScrolling: 'touch',
                scrollbarWidth: 'thin',
              }}
            >
              {sorted.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => navigate(`/stock/${l.id}`)}
                  className="flex w-full items-center justify-between border-b border-hair border-border py-2.5 text-left"
                >
                  <div>
                    <p className="mb-0 text-[18px] font-semibold">{fmtLeft(l.w, l.h)}</p>
                    <p className="mb-0 text-[13px] text-muted-foreground">{originText(l)}</p>
                  </div>
                  <span className="text-faint">›</span>
                </button>
              ))}
            </div>
            {!atBottom && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-background to-transparent" />
            )}
          </div>

          <Button
            variant="outline"
            className="mt-4 h-[50px] w-full"
            onClick={() => navigate('/stock/add')}
          >
            + Add leftover by hand
          </Button>
        </>
      )}
    </AppShell>
  )
}
