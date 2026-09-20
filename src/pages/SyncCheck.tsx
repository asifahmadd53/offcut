import { useNavigate } from 'react-router-dom'
import { IconRefresh } from '@tabler/icons-react'
import { AppShell } from '@/components/AppShell'
import { Button } from '@/components/ui/button'
import { dayMonth, timeAgo, timeOfDay } from '@/lib/format'
import { fmtLeft } from '@/lib/inches'
import { pieceSummary } from '@/lib/summary'
import { saveResolution } from '@/lib/db'
import { useAuth } from '@/store/auth'
import { useData } from '@/store/data'
import { useJob } from '@/store/job'

export default function SyncCheck() {
  const navigate = useNavigate()
  const uid = useAuth((s) => s.uid)
  const derived = useData((s) => s.derived)
  const pendingCount = useData((s) => s.pendingCount)
  const lastSyncedAt = useData((s) => s.lastSyncedAt)
  const setPieces = useJob((s) => s.setPieces)

  // Oldest first, so the carpenter resolves them in the order they happened.
  const conflicts = [...derived.conflicts].sort((a, b) => a.cut.createdAt - b.cut.createdAt)
  const current = conflicts[0]

  function answer(choice: 'voided' | 'kept') {
    if (!uid || !current) return
    saveResolution(uid, current.cut.id, choice) // fire and forget, per R10
    if (choice === 'voided') {
      if (current.cut.pieces) setPieces(current.cut.pieces)
      navigate('/plan')
      return
    }
    if (conflicts.length > 1) return // stays on this screen; the list will shrink once resolutions sync
    navigate('/')
  }

  if (!current) {
    return (
      <AppShell title="Sync check" back="/">
        <div className="mb-4 rounded-xl bg-success-bg p-4">
          <p className="mb-1.5 font-sans text-[16px] font-semibold text-success-text">✓ All clear</p>
          <p className="mb-0 text-[14px] text-success-text">
            Every job on this phone matches the shop record.
          </p>
        </div>
        <div className="mb-4.5 rounded-lg bg-muted p-3.5 text-[13.5px]">
          <p className="mb-1.5 text-muted-foreground">Sync status</p>
          <p className="mb-0.5">Last synced: {lastSyncedAt ? timeAgo(lastSyncedAt) : 'never'}</p>
          <p className="mb-0">Waiting to send: {pendingCount > 0 ? pendingCount : 'none'}</p>
        </div>
        <Button variant="outline" className="h-12 w-full" onClick={() => navigate('/')}>
          Back to home
        </Button>
      </AppShell>
    )
  }

  const { conflict } = current
  const title = conflict?.kind === 'missing' ? 'Leftover not found' : '⚠ Leftover already used'
  const body =
    conflict?.kind === 'missing'
      ? 'A leftover this job used was never saved on this phone. Check the pieces in your workshop, then choose what to do.'
      : conflict?.leftover && conflict.winnerAt
        ? `The ${fmtLeft(conflict.leftover.w, conflict.leftover.h)} leftover from the ${dayMonth(conflict.leftover.sheetDate)} sheet was already used on another phone at ${timeOfDay(conflict.winnerAt)}.`
        : 'A leftover this job used was already claimed by another phone.'

  return (
    <AppShell title={conflicts.length > 1 ? `Sync check · 1 of ${conflicts.length}` : 'Sync check'} back="/">
      <div className="mb-4 rounded-xl bg-warning-bg p-4">
        <p className="mb-2 font-sans text-[16px] font-semibold text-warning-text">{title}</p>
        <p className="mb-2 text-[14px] text-warning-text">{body}</p>
        <p className="mb-0 text-[14px] text-warning-text/85">
          Check the pieces in your workshop, then choose what to do.
        </p>
      </div>

      <div className="mb-4.5 rounded-lg bg-muted p-3 text-[13px]">
        <p className="mb-0.5 text-muted-foreground">Affected job</p>
        {pieceSummary(current.cut.pieces)} · {dayMonth(current.cut.createdAt)}
      </div>

      <Button size="lg" className="mb-2.5 h-[54px] w-full gap-2" onClick={() => answer('voided')}>
        <IconRefresh size={18} />
        Re-plan this job
      </Button>
      <Button variant="outline" className="h-12 w-full" onClick={() => answer('kept')}>
        I cut a different piece
      </Button>
      <p className="mt-3.5 text-center text-[12.5px] text-faint">
        Nothing is deleted. The job stays in your history either way.
      </p>
    </AppShell>
  )
}
