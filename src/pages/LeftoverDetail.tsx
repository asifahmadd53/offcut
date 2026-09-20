import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { SheetDiagram } from '@/components/SheetDiagram'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { dayMonth } from '@/lib/format'
import { fmt } from '@/lib/inches'
import { badgedLeftovers } from '@/lib/labelChoice'
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
  const toast = useToast((s) => s.show)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const leftover = derived.leftovers.find((l) => l.id === id && l.status === 'free')

  if (!leftover) {
    return (
      <AppShell title="Leftover" back="/stock">
        <p className="mt-8 text-center text-[15px] text-muted-foreground">
          This leftover is no longer in stock.
        </p>
        <Button variant="outline" className="mt-4 h-12 w-full" onClick={() => navigate('/stock')}>
          Back to stock
        </Button>
      </AppShell>
    )
  }

  const blocks = buildBlocks(
    {
      sheetId: leftover.sheetId,
      sheetW: leftover.sheetW,
      sheetH: leftover.sheetH,
      sheetDate: leftover.sheetDate,
      isNew: false,
      usedLeftoverId: undefined,
      usedLetter: undefined,
      region: { x: leftover.x, y: leftover.y, w: leftover.w, h: leftover.h },
      placements: [],
      newLeftovers: [],
      steps: [],
    },
    derived,
  ).map((b) =>
    b.kind !== 'earlier' && b.x === leftover.x && b.y === leftover.y && b.w === leftover.w && b.h === leftover.h
      ? { ...b, kind: 'focus' as const }
      : b,
  )

  // Blocks too small to carry their own label still owe their size to the legend (R15).
  const diagramScale = Math.min(120 / leftover.sheetW, 240 / leftover.sheetH)
  const badged = badgedLeftovers(blocks, diagramScale)

  function useInNewJob() {
    setOnlyLeftoverId(leftover!.id)
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
    }
    saveCut(uidAuth, doc) // fire and forget, per R10
    setConfirmOpen(false)
    toast('Leftover removed.')
    navigate('/stock')
  }

  return (
    <AppShell title={`Leftover ${leftover.letter}`} back="/stock">
      <div className="mb-4 flex flex-col items-start gap-4 sm:flex-row sm:gap-5.5">
        <div className="w-full flex-none sm:w-[120px]">
          <SheetDiagram sheetW={leftover.sheetW} sheetH={leftover.sheetH} blocks={blocks} maxW={120} maxH={240} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="mb-0.5 font-sans text-[24px] font-semibold">
            {fmt(Math.min(leftover.w, leftover.h))} × {fmt(Math.max(leftover.w, leftover.h))}
          </p>
          <p className="mb-3 text-[13px] text-muted-foreground">
            {Math.round(leftover.w * leftover.h).toLocaleString()} sq in
          </p>
          {!leftover.manual && (
            <>
              <p className="mb-0.5 text-[13px] text-muted-foreground">From</p>
              <p className="mb-3 text-[14px]">Sheet cut on {dayMonth(leftover.sheetDate)}</p>
              <p className="mb-0.5 text-[13px] text-muted-foreground">Position on the sheet</p>
              <p className="text-[14px]">
                {fmt(leftover.x)} in from the left,
                <br />
                {fmt(leftover.y)} in from the top
              </p>
            </>
          )}
        </div>
      </div>

      {badged.length > 0 && (
        <div className="mb-4 rounded-lg bg-muted p-3 text-[13px]">
          {badged.map((b, i) => (
            <p key={i} className="mb-0 text-muted-foreground">
              {b.letter}: {b.dims}
            </p>
          ))}
        </div>
      )}

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
