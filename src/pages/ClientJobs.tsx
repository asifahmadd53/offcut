import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { IconLayoutGrid, IconTrash } from '@tabler/icons-react'
import { AppShell } from '@/components/AppShell'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { UNASSIGNED_CLIENT_ID, UNASSIGNED_CLIENT_NAME, type Leftover } from '@/lib/types'
import { dayMonth, plural } from '@/lib/format'
import { fmtLeft } from '@/lib/inches'
import { pieceSummary, sourceSummary } from '@/lib/summary'
import { saveCut, saveHiddenJob } from '@/lib/db'
import { getDeviceId, uid } from '@/lib/id'
import { useAuth } from '@/store/auth'
import { useData } from '@/store/data'
import { useJob } from '@/store/job'
import { useToast } from '@/store/toast'
import type { CutDoc } from '@/lib/types'
import type { JobView } from '@/lib/stock'

function originText(l: Leftover): string {
  if (l.manual) return `Added by hand · ${dayMonth(l.createdAt)}`
  return `${l.letter} · from ${dayMonth(l.sheetDate)} sheet`
}

export default function ClientJobs() {
  const { clientId } = useParams()
  const navigate = useNavigate()
  const uidAuth = useAuth((s) => s.uid)
  const derived = useData((s) => s.derived)
  const clearJob = useJob((s) => s.clearJob)
  const setClient = useJob((s) => s.setClient)
  const toast = useToast((s) => s.show)
  const [toDelete, setToDelete] = useState<JobView | null>(null)
  const [leftoverToDelete, setLeftoverToDelete] = useState<Leftover | null>(null)

  const jobs = derived.jobs.filter((j) => (j.cut.clientId || UNASSIGNED_CLIENT_ID) === clientId)
  const leftovers = derived.freeLeftovers
    .filter((l) => l.clientId === clientId)
    .sort((a, b) => b.w * b.h - a.w * a.h)
  const clientName =
    jobs[0]?.cut.clientName || leftovers[0]?.clientName || UNASSIGNED_CLIENT_NAME

  if (jobs.length === 0 && leftovers.length === 0) {
    return (
      <AppShell title="Client" back="/">
        <p className="mt-8 text-center text-[15px] text-muted-foreground">
          This client has no jobs left to show.
        </p>
      </AppShell>
    )
  }

  function startNewJobForClient() {
    clearJob()
    setClient(clientId!, clientName)
    navigate('/new')
  }

  function confirmDelete() {
    if (!uidAuth || !toDelete) return
    saveHiddenJob(uidAuth, toDelete.cut.id) // fire and forget, per R10
    toast('Job removed from the list.')
    setToDelete(null)
  }

  function confirmDeleteLeftover() {
    if (!uidAuth || !leftoverToDelete) return
    const doc: Omit<CutDoc, 'syncedAt'> = {
      id: uid(),
      type: 'discard',
      createdAt: Date.now(),
      deviceId: getDeviceId(),
      sheets: [],
      discardIds: [leftoverToDelete.id],
      clientId: leftoverToDelete.clientId,
      clientName: leftoverToDelete.clientName,
    }
    saveCut(uidAuth, doc) // fire and forget, per R10
    toast('Leftover removed.')
    setLeftoverToDelete(null)
  }

  return (
    <AppShell title={clientName} back="/">
      <p className="mb-4 text-[13px] text-muted-foreground">
        {jobs.length} {jobs.length === 1 ? 'job' : 'jobs'} for this client.
      </p>

      <Button size="lg" className="mb-6 w-full" onClick={startNewJobForClient}>
        + New job for {clientName}
      </Button>

      <div className="mb-2 flex items-center justify-between">
        <p className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
          Jobs
        </p>
        {jobs.length > 0 && (
          <p className="text-[13px] text-muted-foreground">{plural(jobs.length, 'job')}</p>
        )}
      </div>

      {jobs.length === 0 ? (
        <div className="mb-6 rounded-xl border-hair border-border bg-muted py-6 text-center">
          <div className="mx-auto mb-3 flex h-13 w-13 items-center justify-center rounded-xl bg-muted text-faint">
            <IconLayoutGrid size={26} />
          </div>
          <p className="text-[15px] text-muted-foreground">No jobs left for this client.</p>
        </div>
      ) : (
        <div className="mb-6 overflow-hidden rounded-xl border-hair border-border">
          {jobs.map((j, i) => (
            <div
              key={j.cut.id}
              className={`flex items-center justify-between bg-card px-4 py-3 ${
                i > 0 ? 'border-t border-hair border-border' : ''
              }`}
            >
              <button
                type="button"
                onClick={() => navigate(`/job/${j.cut.id}`)}
                className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
              >
                <div className="min-w-0">
                  <p className="mb-0 flex items-center gap-1.5 text-[15px] font-semibold">
                    {pieceSummary(j.cut.pieces)}
                    {j.status === 'conflict' && (
                      <span className="h-1.5 w-1.5 flex-none rounded-full bg-warning-border" />
                    )}
                  </p>
                  <p className="mb-0 text-[13px] text-muted-foreground">
                    {dayMonth(j.cut.createdAt)} · {sourceSummary(j.cut.sheets)}
                  </p>
                </div>
              </button>
              <button
                type="button"
                aria-label="Remove this job from the list"
                onClick={() => setToDelete(j)}
                className="flex h-9 w-9 flex-none items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-danger-text"
              >
                <IconTrash size={18} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mb-2 flex items-center justify-between">
        <p className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
          Saved leftovers
        </p>
        {leftovers.length > 0 && (
          <p className="text-[13px] text-muted-foreground">{plural(leftovers.length, 'leftover')}</p>
        )}
      </div>

      {leftovers.length === 0 ? (
        <div className="mb-4 rounded-xl border-hair border-border bg-muted py-5 text-center text-[13px] text-muted-foreground">
          None yet.
        </div>
      ) : (
        <div className="mb-4 overflow-hidden rounded-xl border-hair border-success-border">
          {leftovers.map((l, i) => (
            <div
              key={l.id}
              className={`flex items-center justify-between bg-success-bg px-4 py-3 ${
                i > 0 ? 'border-t border-hair border-success-border' : ''
              }`}
            >
              <button
                type="button"
                onClick={() => navigate(`/stock/${l.id}`)}
                className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
              >
                <div className="min-w-0">
                  <p className="mb-0 text-[15px] font-semibold text-success-text">{fmtLeft(l.w, l.h)}</p>
                  <p className="mb-0 text-[13px] text-muted-foreground">{originText(l)}</p>
                </div>
              </button>
              <button
                type="button"
                aria-label="Remove this leftover"
                onClick={() => setLeftoverToDelete(l)}
                className="flex h-9 w-9 flex-none items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-danger-text"
              >
                <IconTrash size={18} />
              </button>
            </div>
          ))}
        </div>
      )}

      <Button variant="outline" className="mb-4.5 h-12 w-full" onClick={() => navigate('/stock/add')}>
        + Add leftover by hand
      </Button>

      <Dialog open={!!toDelete} onOpenChange={(open) => !open && setToDelete(null)}>
        <DialogContent>
          <DialogTitle>Remove this job?</DialogTitle>
          <DialogDescription>
            It leaves this list only. Any leftovers it already saved to stock stay exactly as they
            are.
          </DialogDescription>
          <div className="mt-4 flex gap-2.5">
            <Button variant="outline" className="h-11 flex-1" onClick={() => setToDelete(null)}>
              Keep
            </Button>
            <Button className="h-11 flex-1 bg-danger-text hover:opacity-90" onClick={confirmDelete}>
              Remove
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!leftoverToDelete} onOpenChange={(open) => !open && setLeftoverToDelete(null)}>
        <DialogContent>
          <DialogTitle>Remove this leftover?</DialogTitle>
          <DialogDescription>
            It will leave stock and will not be suggested again. Your job history stays as it is.
          </DialogDescription>
          <div className="mt-4 flex gap-2.5">
            <Button variant="outline" className="h-11 flex-1" onClick={() => setLeftoverToDelete(null)}>
              Keep
            </Button>
            <Button
              className="h-11 flex-1 bg-danger-text hover:opacity-90"
              onClick={confirmDeleteLeftover}
            >
              Remove
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  )
}
