import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { PlanSheet } from '@/components/PlanSheet'
import { PrintOrPdfDialog } from '@/components/PrintOrPdfDialog'
import { Button } from '@/components/ui/button'
import { buildBlocks } from '@/lib/sheetView'
import { plural } from '@/lib/format'
import { fmtDims } from '@/lib/inches'
import { forcedNewSheetNote, leftoverUseMessage, usingLeftoverToast, wouldUseLeftover } from '@/lib/leftoverAnnounce'
import { saveCut } from '@/lib/db'
import { getDeviceId, uid } from '@/lib/id'
import { useAuth } from '@/store/auth'
import { useData } from '@/store/data'
import { useJob } from '@/store/job'
import { useSettings } from '@/store/settings'
import { toast } from 'sonner'
import type { CutDoc, Piece, SheetPlan } from '@/lib/types'

function subtitleFor(sheets: SheetPlan[], pieces: Piece[]): string {
  const newCount = sheets.filter((s) => s.isNew).length
  const pieceText = pieces.map((p) => `${fmtDims(p.w, p.h)}, ${plural(p.qty, 'pc')}`).join(' + ')
  if (newCount === sheets.length && newCount > 0) {
    const first = sheets[0]
    const sheetLabel = newCount > 1 ? `${newCount} new sheets` : 'New sheet'
    return `${sheetLabel} ${first.sheetW} × ${first.sheetH} · ${pieceText}`
  }
  return pieceText
}

function reuseBannerText(sheets: SheetPlan[]): string | null {
  const reused = sheets.filter((s) => !s.isNew).length
  const fresh = sheets.length - reused
  if (reused === 0) return null
  if (fresh === 0) return '✓ It fits in a saved leftover. No new sheet needed.'
  return `✓ Uses ${plural(reused, 'saved leftover')} and ${plural(fresh, 'new sheet')}.`
}

export default function Plan() {
  const navigate = useNavigate()
  const uidAuth = useAuth((s) => s.uid)
  const derived = useData((s) => s.derived)
  const pieces = useJob((s) => s.pieces)
  const clientId = useJob((s) => s.clientId)
  const clientName = useJob((s) => s.clientName)
  const clientPhone = useJob((s) => s.clientPhone)
  const sheetNumber = useJob((s) => s.sheetNumber)
  const plan = useJob((s) => s.plan)
  const buildPlan = useJob((s) => s.buildPlan)
  const clearJob = useJob((s) => s.clearJob)
  const onlyLeftoverId = useJob((s) => s.onlyLeftoverId)
  const forceNewSheet = useJob((s) => s.forceNewSheet)
  const setForceNewSheet = useJob((s) => s.setForceNewSheet)
  const settings = useSettings((s) => s.settings)
  const [activeSheet, setActiveSheet] = useState(0)
  const [confirming, setConfirming] = useState(false)
  const announcedRef = useRef(false)
  // Confirm cut only opens the Print/PDF popup over the plan. The cut is written when the
  // user taps Save as PDF, Print or Done (commitCut); X cancels and writes nothing. Once
  // written, `confirming` disables Confirm and the job draft clears when Plan is left.
  const [pendingDoc, setPendingDoc] = useState<Omit<CutDoc, 'syncedAt'> | null>(null)
  const [printOpen, setPrintOpen] = useState(false)
  const savedRef = useRef(false)

  useEffect(
    () => () => {
      if (savedRef.current) clearJob()
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  useEffect(() => {
    if (!plan && pieces.length > 0) buildPlan([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (pieces.length === 0) navigate('/new', { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The one-time "Using leftover A (19 × 48)" toast, only in the normal (non-restricted,
  // non-forced) flow, and only once per plan build — never repeated on a rebuild.
  useEffect(() => {
    if (!plan || onlyLeftoverId || forceNewSheet || announcedRef.current) return
    const used = plan.sheets.filter((s) => !s.isNew)
    if (used.length === 0) return
    const message = usingLeftoverToast(
      used.map((s) => ({
        id: s.usedLeftoverId!,
        letter: s.usedLetter!,
        w: s.region.w,
        h: s.region.h,
        sheetDate: s.sheetDate,
      })),
    )
    if (message) toast.info(message)
    announcedRef.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan])

  if (!plan) return null

  const { sheets, unplaced, excluded, kerf } = plan
  const sheet = sheets[activeSheet] ?? sheets[0]
  const usedLeftoverIds = sheets.filter((s) => !s.isNew).map((s) => s.usedLeftoverId!).filter(Boolean)

  // What a default plan (every leftover, new sheets allowed) would have used, ignoring
  // forceNewSheet — only meaningful outside leftover-restricted mode.
  const kerfValue = settings.kerfOn ? settings.kerfSize : 0
  const defaultWouldUse = onlyLeftoverId
    ? []
    : wouldUseLeftover(pieces, derived.freeLeftovers, {
        sheetW: settings.sheetW,
        sheetH: settings.sheetH,
        kerf: kerfValue,
        minLeftover: settings.minLeftover,
      })

  const announceMessage = !onlyLeftoverId && !forceNewSheet ? leftoverUseMessage(sheets, pieces) : null
  const forcedNote = !onlyLeftoverId && forceNewSheet ? forcedNewSheetNote(defaultWouldUse) : null

  function pickDifferentLeftover() {
    if (confirming) return
    if (!sheet || sheet.isNew || !sheet.usedLeftoverId) return
    buildPlan([...excluded, sheet.usedLeftoverId])
    setActiveSheet(0)
  }

  function undoExclusions() {
    if (confirming) return
    buildPlan([])
    setActiveSheet(0)
  }

  function useNewSheetInstead() {
    if (confirming) return
    setForceNewSheet(true)
    buildPlan([])
    setActiveSheet(0)
  }

  function useLeftoverAfterAll() {
    if (confirming) return
    setForceNewSheet(false)
    buildPlan([])
    setActiveSheet(0)
  }

  async function onConfirm() {
    if (confirming) return

    // Re-check every used leftover is still free: another phone may have claimed it since planning.
    const freeIds = new Set(derived.freeLeftovers.map((l) => l.id))
    const stillFree = usedLeftoverIds.every((id) => freeIds.has(id))
    if (!stillFree) {
      buildPlan(excluded)
      toast.warning('A saved leftover changed. The plan was updated.')
      return
    }

    // Only the pieces that were actually placed, at the quantity that fit.
    const placedCounts = new Map<string, number>()
    for (const s of sheets) {
      for (const p of s.placements) {
        placedCounts.set(p.pieceId, (placedCounts.get(p.pieceId) ?? 0) + 1)
      }
    }
    const placedPieces: Piece[] = pieces
      .map((p) => ({ ...p, qty: placedCounts.get(p.id) ?? 0 }))
      .filter((p) => p.qty > 0)

    const doc: Omit<CutDoc, 'syncedAt'> = {
      id: uid(),
      type: 'cut',
      createdAt: Date.now(),
      deviceId: getDeviceId(),
      pieces: placedPieces,
      kerf,
      sheets,
      clientId,
      clientName,
      clientPhone: clientPhone.trim() || undefined,
      sheetNumber: sheetNumber.trim() || undefined,
    }

    setPendingDoc(doc)
    setPrintOpen(true)
  }

  // Writes the cut once, from whichever of Save as PDF / Print / Done the user taps first.
  function commitCut() {
    if (savedRef.current || !pendingDoc) return
    savedRef.current = true
    setConfirming(true)
    if (uidAuth) saveCut(uidAuth, pendingDoc) // fire and forget, per R10
  }

  const usesLeftover = sheets.some((s) => !s.isNew)
  const manySheets = sheets.length > 5

  return (
    <AppShell
      title="Cutting plan"
      back="/new"
      stickyBar={
        <div className="flex flex-col gap-2.5">
          <Button size="lg" className="w-full" disabled={confirming} onClick={onConfirm}>
            ✓ Confirm cut and save leftovers
          </Button>
          <Button size="lg" variant="outline" className="w-full" onClick={() => navigate('/new')}>
            Change pieces
          </Button>
        </div>
      }
    >
      <p className="mb-1 text-[15px] font-semibold text-foreground">
        Client name: <span className="font-normal text-muted-foreground">{clientName}</span>
      </p>
      <p className="mb-3.5 text-[13px] text-muted-foreground">{subtitleFor(sheets, pieces)}</p>

      {forcedNote && (
        <div className="mb-3.5 rounded-lg bg-muted px-3 py-2.5 text-[13px] text-muted-foreground">
          {forcedNote}{' '}
          <button type="button" onClick={useLeftoverAfterAll} className="font-semibold text-accent-text">
            Use the leftover
          </button>
        </div>
      )}

      {announceMessage ? (
        <div className="mb-3.5 rounded-lg bg-success-bg px-3 py-2.5 text-[14px] text-success-text">
          <p className="mb-1 font-semibold">{announceMessage.title}</p>
          <p className="mb-2.5 whitespace-pre-line">{announceMessage.body}</p>
          <button
            type="button"
            onClick={useNewSheetInstead}
            className="flex h-9 items-center justify-center rounded-lg border-hair border-success-border px-3 text-[13px] font-semibold text-success-text"
          >
            Use a new sheet instead
          </button>
        </div>
      ) : (
        reuseBannerText(sheets) && (
          <div className="mb-3.5 rounded-lg bg-success-bg px-3 py-2.5 text-[14px] text-success-text">
            {reuseBannerText(sheets)}
          </div>
        )
      )}

      {/* Every sheet is stacked on one page at every width — no per-sheet tabs. */}
      <div>
        {sheets.length > 1 && (
          <p className="mb-4 text-xl md:text-2xl lg:text-3xl font-bold text-foreground tracking-tight">
            <span className="text-primary">{sheets.length}</span> {plural(sheets.length, 'sheet').replace(/^\d+\s*/, '')} in this job
          </p>
        )}
        {sheets.map((s, i) => (
          <div key={s.sheetId + i} className="mb-8">
            {sheets.length > 1 && (
              <p className="mb-2 text-[13px] text-muted-foreground">
                Sheet {i + 1} of {sheets.length}
              </p>
            )}
            <PlanSheet sheet={s} blocks={buildBlocks(s, derived, pendingDoc?.id)} />
          </div>
        ))}
      </div>

      {unplaced.length > 0 && (
        <div className="mb-3.5 rounded-lg bg-warning-bg px-3 py-2.5 text-[13.5px] text-warning-text">
          {unplaced.length === 1
            ? `Piece ${unplaced[0].n} does not fit on any sheet. Split it or change the sheet size.`
            : `Pieces ${unplaced.map((u) => u.n).join(', ')} do not fit on any sheet. Split them or change the sheet size.`}
        </div>
      )}

      {manySheets && (
        <div className="mb-3.5 rounded-lg bg-warning-bg px-3 py-2.5 text-[13.5px] text-warning-text">
          This job needs {sheets.length} sheets. Check the quantities before you cut.
        </div>
      )}

      {usesLeftover && (
        <Button variant="outline" className="mb-1 w-full" onClick={pickDifferentLeftover}>
          Pick a different leftover
        </Button>
      )}

      {excluded.length > 0 && (
        <p className="mt-3 text-center text-[13px] text-muted-foreground">
          {plural(excluded.length, 'leftover')} skipped.{' '}
          <button type="button" onClick={undoExclusions} className="text-accent-text">
            Undo
          </button>
        </p>
      )}

      {pendingDoc && (
        <PrintOrPdfDialog
          open={printOpen}
          onOpenChange={setPrintOpen}
          cut={{ ...pendingDoc, syncedAt: null }}
          onBeforeSave={commitCut}
          onPrint={() => {
            commitCut()
            navigate(`/print/${pendingDoc.id}`, { replace: true })
          }}
          onDone={() => {
            commitCut()
            navigate('/', { replace: true })
          }}
        />
      )}
    </AppShell>
  )
}
