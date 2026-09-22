import { useNavigate, useParams } from 'react-router-dom'
import { useState } from 'react'
import { AppShell } from '@/components/AppShell'
import { PlanSheet } from '@/components/PlanSheet'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { dayMonth } from '@/lib/format'
import { fmt } from '@/lib/inches'
import { saveCut } from '@/lib/db'
import { getDeviceId, uid } from '@/lib/id'
import { buildBlocks } from '@/lib/sheetView'
import { useAuth } from '@/store/auth'
import { useData } from '@/store/data'
import { useJob } from '@/store/job'
import { useToast } from '@/store/toast'
import type { CutDoc } from '@/lib/types'

export default function LeftoverDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const uidAuth = useAuth((s) => s.uid)
  const derived = useData((s) => s.derived)
  const setOnlyLeftoverId = useJob((s) => s.setOnlyLeftoverId)
  const setClient = useJob((s) => s.setClient)
  const toast = useToast((s) => s.show)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const leftover = derived.leftovers.find((l) => l.id === id && l.status === 'free')
  const backTo = leftover ? `/client/${leftover.clientId}` : '/'

  if (!leftover) {
    return (
      <AppShell title="Leftover" back="/">
        <p className="mt-8 text-center text-[15px] text-muted-foreground">
          This leftover is no longer in stock.
        </p>
        <Button variant="outline" className="mt-4 h-12 w-full" onClick={() => navigate('/')}>
          Back to Home
        </Button>
      </AppShell>
    )
  }

  // The exact same SheetPlan record Job detail renders for the cut that created this
  // leftover (found via createdByCutId, present for both real cuts and hand-added
  // leftovers alike) — so Cut order, Sheet used %, Saved to stock and the legend are
  // byte-for-byte identical to Job detail, not a re-derived summary of just this leftover.
  const sourceCut = derived.activeCuts.find((c) => c.id === leftover.createdByCutId)
  const sheet = sourceCut?.sheets.find((s) => s.sheetId === leftover.sheetId)

  if (!sourceCut || !sheet) {
    return (
      <AppShell title="Leftover" back={backTo}>
        <p className="mt-8 text-center text-[15px] text-muted-foreground">
          This leftover's sheet could not be found.
        </p>
        <Button variant="outline" className="mt-4 h-12 w-full" onClick={() => navigate(backTo)}>
          Back to {leftover.clientName}
        </Button>
      </AppShell>
    )
  }

  const blocks = buildBlocks(sheet, derived, sourceCut.id)

  // The one block matching this leftover's own geometry is highlighted with a solid
  // border on the shared diagram (PlanSheet/SheetDiagram's highlightIndex prop) instead
  // of being given a different block kind, so it never changes the drawing's geometry
  // or labels.
  const highlightIndex = blocks.findIndex(
    (b) => b.kind !== 'earlier' && b.x === leftover.x && b.y === leftover.y && b.w === leftover.w && b.h === leftover.h,
  )

  function useInNewJob() {
    setOnlyLeftoverId(leftover!.id)
    setClient(leftover!.clientId, leftover!.clientName)
    navigate('/new')
  }

  function discard() {
    if (!uidAuth) return
    const doc: Omit<CutDoc, 'syncedAt'> = {
      id: uid(),
      type: 'discard',
      createdAt: Date.now(),
      deviceId: getDeviceId(),
      sheets: [],
      discardIds: [leftover!.id],
      clientId: leftover!.clientId,
      clientName: leftover!.clientName,
    }
    saveCut(uidAuth, doc) // fire and forget, per R10
    setConfirmOpen(false)
    toast('Leftover removed.')
    navigate(backTo)
  }

  return (
    <AppShell title={`Leftover ${leftover.letter}`} back={backTo}>
      <div className="mb-3.5 rounded-lg bg-muted p-3 text-[13px]">
        <p className="mb-0.5 font-sans text-[24px] font-semibold text-foreground">
          {fmt(Math.min(leftover.w, leftover.h))} × {fmt(Math.max(leftover.w, leftover.h))}
        </p>
        <p className="mb-2 text-muted-foreground">
          {Math.round(leftover.w * leftover.h).toLocaleString()} sq in
        </p>
        <p className="mb-0.5 text-muted-foreground">Client</p>
        <p className="mb-2 text-foreground">{leftover.clientName}</p>
        {!leftover.manual && (
          <>
            <p className="mb-0.5 text-muted-foreground">From</p>
            <p className="mb-2 text-foreground">Sheet cut on {dayMonth(leftover.sheetDate)}</p>
            <p className="mb-0.5 text-muted-foreground">Position on the sheet</p>
            <p className="text-foreground">
              {fmt(leftover.x)} in from the left, {fmt(leftover.y)} in from the top
            </p>
          </>
        )}
      </div>

      <PlanSheet sheet={sheet} blocks={blocks} highlightIndex={highlightIndex >= 0 ? highlightIndex : undefined} />

      <Button size="lg" className="mb-2.5 h-[52px] w-full" onClick={useInNewJob}>
        Use this in a new job
      </Button>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <Button
          variant="outline"
          className="h-12 w-full border-danger-border text-danger-text"
          onClick={() => setConfirmOpen(true)}
        >
          Throw away / lost
        </Button>
        <DialogContent>
          <DialogTitle>Remove this leftover?</DialogTitle>
          <DialogDescription>
            It will leave your stock and will not be suggested again. Your job history stays as
            it is.
          </DialogDescription>
          <div className="mt-4 flex gap-2.5">
            <Button variant="outline" className="h-11 flex-1" onClick={() => setConfirmOpen(false)}>
              Keep
            </Button>
            <Button className="h-11 flex-1 bg-danger-text hover:opacity-90" onClick={discard}>
              Remove
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  )
}
