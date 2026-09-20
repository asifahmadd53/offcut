import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { PlanSheet } from '@/components/PlanSheet'
import { Button } from '@/components/ui/button'
import { buildBlocks } from '@/lib/sheetView'
import { plural } from '@/lib/format'
import { fmtDims } from '@/lib/inches'
import { saveCut } from '@/lib/db'
import { getDeviceId, uid } from '@/lib/id'
import { useAuth } from '@/store/auth'
import { useData } from '@/store/data'
import { useJob } from '@/store/job'
import { useToast } from '@/store/toast'
import type { CutDoc, Piece, SheetPlan } from '@/lib/types'

function subtitleFor(sheets: SheetPlan[], pieces: Piece[]): string {
  const newCount = sheets.filter((s) => s.isNew).length
  const pieceText = pieces.map((p) => `${fmtDims(p.w, p.h)}, ${plural(p.qty, 'pc')}`).join(' + ')
  if (newCount === sheets.length && newCount > 0) {
    const first = sheets[0]
    const sheetLabel = newCount > 1 ? `${newCount} new sheets` : 'New sheet'
    return `${sheetLabel} ${first.sheetH} × ${first.sheetW} · ${pieceText}`
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
  const plan = useJob((s) => s.plan)
  const buildPlan = useJob((s) => s.buildPlan)
  const clearJob = useJob((s) => s.clearJob)
  const toast = useToast((s) => s.show)
  const [activeSheet, setActiveSheet] = useState(0)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    if (!plan && pieces.length > 0) buildPlan([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (pieces.length === 0) navigate('/new', { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!plan) return null

  const { sheets, unplaced, excluded, kerf } = plan
  const sheet = sheets[activeSheet] ?? sheets[0]
  const usedLeftoverIds = sheets.filter((s) => !s.isNew).map((s) => s.usedLeftoverId!).filter(Boolean)

  function pickDifferentLeftover() {
    if (!sheet || sheet.isNew || !sheet.usedLeftoverId) return
    buildPlan([...excluded, sheet.usedLeftoverId])
    setActiveSheet(0)
  }

  function undoExclusions() {
    buildPlan([])
    setActiveSheet(0)
  }

  async function onConfirm() {
    if (confirming) return
    setConfirming(true)

    // Re-check every used leftover is still free: another phone may have claimed it since planning.
    const freeIds = new Set(derived.freeLeftovers.map((l) => l.id))
    const stillFree = usedLeftoverIds.every((id) => freeIds.has(id))
    if (!stillFree) {
      buildPlan(excluded)
      toast('A saved leftover changed. The plan was updated.')
      setConfirming(false)
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
    }

    if (uidAuth) saveCut(uidAuth, doc) // fire and forget, per R10

    const newLeftoverCount = sheets.reduce((sum, s) => sum + s.newLeftovers.length, 0)
    clearJob()
    toast(`Cut saved. ${plural(newLeftoverCount, 'leftover')} added.`)
    navigate('/')
  }

  const usesLeftover = sheets.some((s) => !s.isNew)
  const manySheets = sheets.length > 5

  return (
    <AppShell title="Cutting plan" back="/new">
      <p className="mb-3.5 text-[13px] text-muted-foreground">{subtitleFor(sheets, pieces)}</p>

      {reuseBannerText(sheets) && (
        <div className="mb-3.5 rounded-lg bg-success-bg px-3 py-2.5 text-[14px] text-success-text">
          {reuseBannerText(sheets)}
        </div>
      )}

      {sheets.length > 1 && (
        <div className="mb-3 flex gap-2.5">
          {sheets.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setActiveSheet(i)}
              className={
                i === activeSheet
                  ? 'rounded-full bg-primary px-2.5 py-1 text-[12px] font-semibold text-primary-foreground'
                  : 'rounded-full bg-muted px-2.5 py-1 text-[12px] text-muted-foreground'
              }
            >
              Sheet {i + 1}
            </button>
          ))}
        </div>
      )}

      {sheet && <PlanSheet sheet={sheet} blocks={buildBlocks(sheet, derived)} />}

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

      <Button size="lg" className="mb-2.5 h-14 w-full" disabled={confirming} onClick={onConfirm}>
        ✓ Confirm cut and save leftovers
      </Button>

      {usesLeftover ? (
        <>
          <Button variant="outline" className="mb-1 h-12 w-full" onClick={pickDifferentLeftover}>
            Pick a different leftover
          </Button>
          <button
            type="button"
            onClick={() => navigate('/new')}
            className="block w-full text-center text-[14px] text-accent-text"
          >
            Change pieces
          </button>
        </>
      ) : (
        <Button variant="outline" className="h-12 w-full" onClick={() => navigate('/new')}>
          Change pieces
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
    </AppShell>
  )
}
