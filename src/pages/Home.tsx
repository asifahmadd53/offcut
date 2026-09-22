import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { IconChevronRight, IconLayoutGrid, IconTrash, IconUser } from '@tabler/icons-react'
import { AppShell } from '@/components/AppShell'
import { SyncBadge } from '@/components/SyncBadge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { clientFolders, type ClientFolder } from '@/lib/clients'
import { dayMonth, plural } from '@/lib/format'
import { saveHiddenJob } from '@/lib/db'
import { UNASSIGNED_CLIENT_ID } from '@/lib/types'
import { useAuth } from '@/store/auth'
import { useData } from '@/store/data'
import { useJob } from '@/store/job'
import { useToast } from '@/store/toast'

export default function Home() {
  const navigate = useNavigate()
  const uidAuth = useAuth((s) => s.uid)
  const derived = useData((s) => s.derived)
  const clearJob = useJob((s) => s.clearJob)
  const toast = useToast((s) => s.show)
  const listRef = useRef<HTMLDivElement>(null)
  const [atBottom, setAtBottom] = useState(false)
  const [toDelete, setToDelete] = useState<ClientFolder | null>(null)

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
  const folders = clientFolders(derived.jobs)
  const conflictCount = derived.conflicts.length
  const firstUse = derived.jobs.length === 0 && derived.freeLeftovers.length === 0

  useEffect(() => {
    onListScroll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folders.length])

  function startNewJob() {
    clearJob()
    navigate('/new')
  }

  function confirmDeleteClient() {
    if (!uidAuth || !toDelete) return
    const clientJobIds = derived.jobs
      .filter((j) => (j.cut.clientId || UNASSIGNED_CLIENT_ID) === toDelete.id)
      .map((j) => j.cut.id)
    for (const id of clientJobIds) saveHiddenJob(uidAuth, id) // fire and forget, per R10
    toast(`${toDelete.name} removed from the list.`)
    setToDelete(null)
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
            <div className="rounded-lg bg-muted p-3">
              <p className="mb-0 text-[13px] text-muted-foreground">Saved leftovers</p>
              <p className="mb-0 font-sans text-[24px] font-semibold">{freeCount}</p>
            </div>
            <div className="rounded-lg bg-muted p-3">
              <p className="mb-0 text-[13px] text-muted-foreground">Jobs this month</p>
              <p className="mb-0 font-sans text-[24px] font-semibold">{jobsThisMonth}</p>
            </div>
          </div>

          <Button size="lg" className="mb-4.5 w-full" onClick={startNewJob}>
            + New cutting job
          </Button>

          {folders.length > 0 && (
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
                  {folders.map((f) => (
                    <div
                      key={f.id}
                      className="mb-2 flex items-center justify-between rounded-md border-hair border-border py-2.5 pl-4 pr-2"
                    >
                      <button
                        type="button"
                        onClick={() => navigate(`/client/${f.id}`)}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      >
                        <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-muted text-muted-foreground">
                          <IconUser size={18} />
                        </div>
                        <div className="min-w-0">
                          <p className="mb-0 truncate text-[15px] font-semibold">{f.name}</p>
                          <p className="mb-0 text-[13px] text-muted-foreground">
                            {plural(f.jobCount, 'job')} · {dayMonth(f.lastActivity)}
                          </p>
                        </div>
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove ${f.name} from the list`}
                        onClick={() => setToDelete(f)}
                        className="flex h-9 w-9 flex-none items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-danger-text"
                      >
                        <IconTrash size={18} />
                      </button>
                      <IconChevronRight size={18} className="ml-1 flex-none text-faint" />
                    </div>
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

      <Dialog open={!!toDelete} onOpenChange={(open) => !open && setToDelete(null)}>
        <DialogContent>
          <DialogTitle>Remove {toDelete?.name}?</DialogTitle>
          <DialogDescription>
            Their jobs leave this list only. Any leftovers already saved to stock stay exactly as
            they are.
          </DialogDescription>
          <div className="mt-4 flex gap-2.5">
            <Button variant="outline" className="h-11 flex-1" onClick={() => setToDelete(null)}>
              Keep
            </Button>
            <Button
              className="h-11 flex-1 bg-danger-text hover:opacity-90"
              onClick={confirmDeleteClient}
            >
              Remove
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  )
}
