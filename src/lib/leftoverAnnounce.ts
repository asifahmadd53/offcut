import { dayMonth } from './format'
import { fmtDims, fmtLeft } from './inches'
import { packJob, type PackOptions } from './packer'
import type { Leftover, Piece, SheetPlan } from './types'

export interface UsedLeftover {
  id: string
  letter: string
  w: number
  h: number
  /** When the parent sheet was first cut (ms); used for "from the 15 Sep sheet". */
  sheetDate: number
}

/**
 * Which saved leftovers a *default* plan (every leftover in stock, new sheets allowed)
 * would use for these pieces. Pure and side-effect free, so the Plan screen can ask
 * "what would normally happen" without touching the plan actually being shown, for
 * example to explain a forced-new-sheet choice.
 */
export function wouldUseLeftover(
  pieces: Piece[],
  stock: Leftover[],
  options: PackOptions,
): UsedLeftover[] {
  const result = packJob(pieces, stock, { ...options, allowNewSheets: true })
  return usedLeftoversFrom(result.sheets)
}

function usedLeftoversFrom(sheets: SheetPlan[]): UsedLeftover[] {
  return sheets
    .filter((s) => !s.isNew && s.usedLeftoverId && s.usedLetter)
    .map((s) => ({
      id: s.usedLeftoverId!,
      letter: s.usedLetter!,
      w: s.region.w,
      h: s.region.h,
      sheetDate: s.sheetDate,
    }))
}

/** Distinct pieces (in typed order) that have at least one placement on a leftover sheet. */
function distinctPiecesOnLeftovers(sheets: SheetPlan[], pieces: Piece[]): Piece[] {
  const placedIds = new Set(
    sheets.filter((s) => !s.isNew).flatMap((s) => s.placements.map((p) => p.pieceId)),
  )
  return pieces.filter((p) => placedIds.has(p.id))
}

/** How many individual pieces (respecting quantity) were placed on leftover vs. new sheets. */
function placementCounts(sheets: SheetPlan[]): { onLeftover: number; onNewSheet: number } {
  let onLeftover = 0
  let onNewSheet = 0
  for (const s of sheets) {
    if (s.isNew) onNewSheet += s.placements.length
    else onLeftover += s.placements.length
  }
  return { onLeftover, onNewSheet }
}

/**
 * The banner text for the Plan screen when a default (non-restricted) plan used one
 * or more saved leftovers. Returns null when the plan used no leftover at all.
 */
export function leftoverUseMessage(
  sheets: SheetPlan[],
  pieces: Piece[],
): { title: string; body: string } | null {
  const used = usedLeftoversFrom(sheets)
  if (used.length === 0) return null

  const newSheetCount = sheets.filter((s) => s.isNew).length
  const distinctOnLeftover = distinctPiecesOnLeftovers(sheets, pieces)
  const { onLeftover: leftoverPieceCount, onNewSheet: newSheetPieceCount } = placementCounts(sheets)

  if (newSheetCount === 0) {
    const title = 'You had a leftover, so I used it'
    const savedText = used.length === 1 ? 'You saved 1 sheet.' : `You saved ${used.length} sheets.`

    if (used.length === 1) {
      const pieceText = distinctOnLeftover.length === 1
        ? `Your ${fmtDims(distinctOnLeftover[0].w, distinctOnLeftover[0].h)} piece`
        : 'Your pieces'
      const l = used[0]
      const body = `${pieceText} fits in saved leftover ${l.letter} (${fmtLeft(l.w, l.h)}) from the ${dayMonth(l.sheetDate)} sheet. No new sheet needed. ${savedText}`
      return { title, body }
    }

    // Several leftovers: one line each, per spec.
    const lines = used.map(
      (l) => `${l.letter} (${fmtLeft(l.w, l.h)}) from the ${dayMonth(l.sheetDate)} sheet`,
    )
    const body = `Your pieces fit in saved leftovers:\n${lines.join('\n')}\nNo new sheet needed. ${savedText}`
    return { title, body }
  }

  const title = 'Part of this job fits in your leftovers'
  const firstLeftover = used[0]
  const body =
    `${leftoverPieceCount === 1 ? '1 piece fits' : `${leftoverPieceCount} pieces fit`} in leftover ${firstLeftover.letter} (${fmtLeft(firstLeftover.w, firstLeftover.h)}). ` +
    `${newSheetPieceCount === 1 ? '1 piece needs' : `${newSheetPieceCount} pieces need`} a new sheet.`
  return { title, body }
}

/** "Using leftover A (19 × 48)" — the one-time toast when Plan first opens with a leftover in use. */
export function usingLeftoverToast(used: UsedLeftover[]): string | null {
  if (used.length === 0) return null
  const first = used[0]
  return `Using leftover ${first.letter} (${fmtLeft(first.w, first.h)})`
}

/** "You chose a new sheet. Leftover A (19 × 48) could have held this." */
export function forcedNewSheetNote(wouldUse: UsedLeftover[]): string | null {
  if (wouldUse.length === 0) return null
  const first = wouldUse[0]
  return `You chose a new sheet. Leftover ${first.letter} (${fmtLeft(first.w, first.h)}) could have held this.`
}
