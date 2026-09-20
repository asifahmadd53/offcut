import { allRectSizeLabels, type RectSizeLabel } from './diagramLayout'
import { dayMonth, timeOfDay } from './format'
import { fmt } from './inches'
import { pieceSummary, sourceSummary } from './summary'
import { buildBlocks } from './sheetView'
import type { Block } from './sheetView'
import type { Derived } from './stock'
import type { CutDoc, Settings, SheetPlan } from './types'

/** One row of the printed parts table for one sheet. */
export interface PrintPartRow {
  label: string
  width: string
  height: string
  status: 'Piece' | 'Turned piece' | 'Saved leftover' | 'Waste' | 'Already cut'
}

export interface PrintPage {
  sheetIndex: number
  sheetTotal: number
  jobTitle: string
  dateTimeText: string
  sheetSizeText: string
  sourceText: string
  bladeText: string
  sheet: SheetPlan
  blocks: Block[]
  cutOrder: string[]
  parts: PrintPartRow[]
  footerLeft: string
  pageNumber: number
  pageTotal: number
}

function statusFor(_label: RectSizeLabel, block: Block): PrintPartRow['status'] {
  if (block.kind === 'cut') return block.rotated ? 'Turned piece' : 'Piece'
  if (block.kind === 'earlier') return 'Already cut'
  if (block.kind === 'waste') return 'Waste'
  return 'Saved leftover'
}

function partsTableFor(blocks: Block[]): PrintPartRow[] {
  // Use the same pxPerInch-independent facts (width/height/name) the screen diagram
  // uses — pxPerInch only affects placement (inside-edges vs callout), not the table,
  // so a fixed representative scale is fine here; every rectangle appears regardless.
  const labels = allRectSizeLabels(blocks, 10)
  return labels.map((l) => {
    const b = blocks[l.blockIndex]
    return {
      label: l.name,
      width: l.width,
      height: l.height,
      status: statusFor(l, b),
    }
  })
}

function sourceTextFor(sheet: SheetPlan): string {
  if (sheet.isNew) return 'New sheet'
  return `Saved leftover ${sheet.usedLetter} · ${fmt(sheet.region.w)} × ${fmt(sheet.region.h)} from the ${dayMonth(sheet.sheetDate)} sheet`
}

function bladeTextFor(kerf: number | undefined): string {
  return kerf && kerf > 0 ? `Blade thickness ${fmt(kerf)} in included` : 'Blade thickness not included'
}

/**
 * Builds one print-page descriptor per sheet in cut.sheets, in order (sheet 1 = page 1).
 * No cover page. Pure: draws only on local data already in `derived` (Firestore's cache),
 * so it works fully offline. Reuses buildBlocks (sheetView.ts, unchanged) for the SAME
 * diagram geometry as the screen, and allRectSizeLabels (diagramLayout.ts, Part 1) for
 * the SAME rectangle-sizing logic as the on-screen edge labels/callouts, so the parts
 * table is never a second, divergent enumeration of the same rectangles.
 */
export function buildPrintPages(cut: CutDoc, derived: Derived, _settings: Settings): PrintPage[] {
  const total = cut.sheets.length
  const title = pieceSummary(cut.pieces)
  const dateTimeText = `${dayMonth(cut.createdAt)} · ${timeOfDay(cut.createdAt)}`
  const bladeText = bladeTextFor(cut.kerf)

  return cut.sheets.map((sheet, i) => {
    const blocks = buildBlocks(sheet, derived, cut.id)
    return {
      sheetIndex: i,
      sheetTotal: total,
      jobTitle: title,
      dateTimeText,
      sheetSizeText: `${fmt(sheet.sheetW)} × ${fmt(sheet.sheetH)} in`,
      sourceText: sourceTextFor(sheet),
      bladeText,
      sheet,
      blocks,
      cutOrder: sheet.steps,
      parts: partsTableFor(blocks),
      footerLeft: 'Drawn to scale, not full size. Follow the written sizes.',
      pageNumber: i + 1,
      pageTotal: total,
    }
  })
}

/** "New sheet" / "from leftover" style summary across all sheets, reused for headers if needed. */
export const overallSourceText = sourceSummary
