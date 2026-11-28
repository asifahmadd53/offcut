import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconLayoutGrid,
  IconSearch,
  IconX,
} from '@tabler/icons-react'
import { AppShell } from '@/components/AppShell'
import { SyncBadge } from '@/components/SyncBadge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { clientFolders, type ClientFolder } from '@/lib/clients'
import { dayMonth, plural } from '@/lib/format'
import { UNASSIGNED_CLIENT_ID } from '@/lib/types'
import { useAuth } from '@/store/auth'
import { useData } from '@/store/data'
import { useJob } from '@/store/job'
import { toast } from 'sonner'

const STEP = 10 // clients shown first, and added by each tap on Show more

// "Asif Khan" -> "AK". Works for any script, and never returns an empty string.
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const first = Array.from(parts[0] ?? '')[0] ?? '?'
  const second = parts[1] ? (Array.from(parts[1])[0] ?? '') : ''
  return (first + second).toUpperCase()
}

type Group = { title: string; items: ClientFolder[] }

export default function Home() {
  const navigate = useNavigate()
  const uidAuth = useAuth((s) => s.uid)
  const derived = useData((s) => s.derived)
  const hideJobs = useData((s) => s.hideJobs)
  const ready = useData((s) => s.ready)
  const clearJob = useJob((s) => s.clearJob)

  const [search, setSearch] = useState('')
  const [shownCount, setShownCount] = useState(STEP)
  const [selecting, setSelecting] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [confirmOpen, setConfirmOpen] = useState(false)

  const folders = clientFolders(derived.jobs)
  const needle = search.trim().toLowerCase()
  const matched = needle ? folders.filter((f) => f.name.toLowerCase().includes(needle)) : folders
  const visible = matched.slice(0, shownCount)
  const left = matched.length - visible.length
  const pickedNames = folders.filter((f) => picked.has(f.id)).map((f) => f.name)
  const conflictCount = derived.conflicts.length
  const firstUse = ready && derived.jobs.length === 0 && derived.freeLeftovers.length === 0

  // Group the visible clients by when they were last worked on. The list is already newest first.
  const t = new Date()
  const today0 = new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime()
  const yesterday0 = new Date(t.getFullYear(), t.getMonth(), t.getDate() - 1).getTime()
  const week0 = new Date(t.getFullYear(), t.getMonth(), t.getDate() - 6).getTime()
  const groupOf = (ms: number) =>
    ms >= today0 ? 'Today' : ms >= yesterday0 ? 'Yesterday' : ms >= week0 ? 'This week' : 'Earlier'

  const groups: Group[] = []
  for (const f of visible) {
    const title = groupOf(f.lastActivity)
    const last = groups[groups.length - 1]
    if (last && last.title === title) last.items.push(f)
    else groups.push({ title, items: [f] })
  }

  function startNewJob() {
    clearJob()
    navigate('/new')
  }

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function exitSelect() {
    setSelecting(false)
    setPicked(new Set())
  }

  function confirmRemove() {
    if (!uidAuth || picked.size === 0) return
    const ids = derived.jobs
      .filter((j) => picked.has(j.cut.clientId || UNASSIGNED_CLIENT_ID))
      .map((j) => j.cut.id)
    hideJobs(uidAuth, ids)
    toast(picked.size === 1 ? 'Removed from the list.' : `${picked.size} clients removed from the list.`)
    setConfirmOpen(false)
    exitSelect()
  }

  return (
    <AppShell
      title="Offcut"
      tab="home"
      headerRight={<SyncBadge />}
      stickyBar={
        selecting ? (
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setPicked(new Set(matched.map((f) => f.id)))}
              className="h-10 rounded-lg px-2 text-[14px] text-accent-text hover:bg-muted"
            >
              Select all ({matched.length})
            </button>
            <Button
              size="lg"
              className="bg-red-700 text-white hover:opacity-90"
              disabled={picked.size === 0}
              onClick={() => setConfirmOpen(true)}
            >
              Remove{picked.size > 0 ? ` (${picked.size})` : ''}
            </Button>
          </div>
        ) : undefined
      }
    >
      {conflictCount > 0 && (
        <div className="mb-3.5 rounded-[10px] bg-danger-bg p-3.5">
          <p className="mb-1 text-[15px] font-semibold text-red-600 dark:text-red-400">
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

      {!ready ? (
        <div className="animate-pulse" aria-busy="true" aria-label="Loading">
          <div className="mb-3 h-[46px] rounded-xl bg-muted" />
          <div className="mb-5 h-[46px] rounded-xl bg-muted" />
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="mb-3 flex items-center gap-3">
              <div className="h-10 w-10 flex-none rounded-full bg-muted" />
              <div className="flex-1">
                <div className="mb-1.5 h-3.5 w-1/3 rounded bg-muted" />
                <div className="h-3 w-1/4 rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      ) : firstUse ? (
        <div className="py-6 text-center">
          <div className="mx-auto mb-3 flex w-13 items-center justify-center rounded-md bg-muted text-faint">
            <IconLayoutGrid size={26} />
          </div>
          <p className="mb-1 text-[17px] font-semibold">No cuts yet</p>
          <p className="mx-auto mb-5 max-w-[34ch] text-[13px] text-muted-foreground">
            Start your first cutting job.
          </p>
          <Button size="lg" className="mb-4.5 w-full" onClick={startNewJob}>
            + New cutting job
          </Button>
        </div>
      ) : (
        <>
          <Button size="lg" className="mb-3.5 w-full" onClick={startNewJob}>
            + New cutting job
          </Button>

          <div className="relative">
            <IconSearch
              size={18}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              placeholder="Search clients"
              autoComplete="off"
                  className="h-[44px] border bg-transparent px-3 pl-11 text-[16px] "
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setShownCount(STEP)
              }}
            />
            {search && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => {
                  setSearch('')
                  setShownCount(STEP)
                }}
                className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-background"
              >
                <IconX size={17} />
              </button>
            )}
          </div>

          <div className="mt-2 flex min-h-[36px] items-center justify-between">
            <p className="mb-0 text-[13px] text-muted-foreground">
              {matched.length} {matched.length === 1 ? 'client' : 'clients'}
            </p>
            {folders.length > 1 && (
              <button
                type="button"
                onClick={() => (selecting ? exitSelect() : setSelecting(true))}
                className="h-9 rounded-lg px-2 text-[14px] text-accent-text hover:bg-muted"
              >
                {selecting ? 'Done' : 'Edit'}
              </button>
            )}
          </div>

          {groups.map((g) => (
            <div key={g.title}>
              <p className="mb-1 mt-3 text-[12px] font-semibold text-muted-foreground">{g.title}</p>
              {g.items.map((f) => {
                const on = picked.has(f.id)
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => (selecting ? toggle(f.id) : navigate(`/client/${f.id}`))}
                    className={`w-full  gap-3 mb-2 rounded-md  px-1 py-2.5 text-left transition-colors last:border-b-0 hover:bg-muted/50 flex items-center justify-between border-hair border-border  pl-4 pr-2 ${on ? 'bg-accent-bg' : ''
                      }`}
                  >
                    {selecting ? (
                      <span
                        className={`flex h-[22px] w-[22px] flex-none items-center justify-center rounded-md border-2 ${on
                          ? 'border-accent-border bg-accent-text text-background'
                          : 'border-border-strong text-transparent'
                          }`}
                      >
                        <IconCheck size={15} stroke={3} />
                      </span>
                    ) : (
                      <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-muted text-[14px] font-semibold text-muted-foreground">
                        {initials(f.name)}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold">{f.name}</span>
                      <span className="block text-[13px] text-muted-foreground">
                        {plural(f.jobCount, 'job')} · {dayMonth(f.lastActivity)}
                      </span>
                    </span>
                    {!selecting && <IconChevronRight size={18} className="flex-none text-faint" />}
                  </button>
                )
              })}
            </div> 
          ))}

          {needle && matched.length === 0 && (
            <p className="mt-8 text-center text-[14px] text-muted-foreground">No client found.</p>
          )}

          {left > 0 && (
            <button
              type="button"
              onClick={() => setShownCount((n) => n + STEP)}
              className="mt-1 flex h-11 w-full items-center justify-center gap-1.5 rounded-lg text-[14px] text-accent-text hover:bg-muted"
            >
              Show {Math.min(STEP, left)} more
              <span className="text-muted-foreground">· {left} left</span>
              <IconChevronDown size={16} />
            </button>
          )}
        </>
      )}

      <Dialog open={confirmOpen} onOpenChange={(open) => !open && setConfirmOpen(false)}>
        <DialogContent>
          <DialogTitle>
            Remove {pickedNames.length === 1 ? pickedNames[0] : `${pickedNames.length} clients`}?
          </DialogTitle>
          <DialogDescription>
            Their jobs leave this list only. Any leftovers already saved to stock stay exactly as
            they are.
          </DialogDescription>
          <div className="mt-4 flex gap-2.5">
            <Button size="lg" variant="outline" className="flex-1" onClick={() => setConfirmOpen(false)}>
              Keep
            </Button>
            <Button size="lg" className="flex-1 bg-red-700 text-white hover:opacity-90" onClick={confirmRemove}>
              Remove
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  )
}