import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { IconLayoutGrid, IconTrash } from '@tabler/icons-react'
import { AppShell } from '@/components/AppShell'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { UNASSIGNED_CLIENT_ID, UNASSIGNED_CLIENT_NAME } from '@/lib/types'
import { dayMonth } from '@/lib/format'
import { pieceSummary, sourceSummary } from '@/lib/summary'
import { saveHiddenJob } from '@/lib/db'
import { useAuth } from '@/store/auth'
import { useData } from '@/store/data'
import { useJob } from '@/store/job'
import { useToast } from '@/store/toast'
import type { JobView } from '@/lib/stock'

export default function ClientJobs() {
  const { clientId } = useParams()
  const navigate = useNavigate()
  const uidAuth = useAuth((s) => s.uid)
  const derived = useData((s) => s.derived)
  const setOnlyLeftoverId = useJob((s) => s.setOnlyLeftoverId)
  const setForceNewSheet = useJob((s) => s.setForceNewSheet)
  const setClient = useJob((s) => s.setClient)
  const toast = useToast((s) => s.show)
  const [toDelete, setToDelete] = useState<JobView | null>(null)

  const jobs = derived.jobs.filter((j) => (j.cut.clientId || UNASSIGNED_CLIENT_ID) === clientId)
  const clientName = jobs[0]?.cut.clientName || UNASSIGNED_CLIENT_NAME

  if (jobs.length === 0) {
    return (
      <AppShell title="Client" back="/">
        <p className="mt-8 text-center text-[15px] text-muted-foreground">
          This client has no jobs left to show.
        </p>
      </AppShell>
    )
  }

  function startNewJobForClient() {
    setOnlyLeftoverId(null)
    setForceNewSheet(false)
    setClient(clientId!, clientName)
    navigate('/new')
  }

  function confirmDelete() {
    if (!uidAuth || !toDelete) return
    saveHiddenJob(uidAuth, toDelete.cut.id) // fire and forget, per R10
    toast('Job removed from the list.')
    setToDelete(null)
  }

  return (
    <AppShell title={clientName} back="/">
      <p className="mb-4 text-[13px] text-muted-foreground">
        {jobs.length} {jobs.length === 1 ? 'job' : 'jobs'} for this client.
      </p>

      <Button size="lg" className="mb-4.5 w-full" onClick={startNewJobForClient}>
        + New job for {clientName}
      </Button>

      <div className="mb-4.5">
        {jobs.map((j) => (
          <div
            key={j.cut.id}
            className="mb-2 flex items-center justify-between rounded-md border-hair border-border p-4 py-2.5"
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
              className="flex h-9 w-9 flex-none items-center justify-center text-muted-foreground"
            >
              <IconTrash size={18} />
            </button>
          </div>
        ))}
      </div>

      {jobs.length === 0 && (
        <div className="py-6 text-center">
          <div className="mx-auto mb-3 flex h-13 w-13 items-center justify-center rounded-xl bg-muted text-faint">
            <IconLayoutGrid size={26} />
          </div>
          <p className="text-[15px] text-muted-foreground">No jobs left for this client.</p>
        </div>
      )}

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
    </AppShell>
  )
}
