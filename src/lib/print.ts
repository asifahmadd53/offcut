import { sizesList, type SizesListEntry } from './diagramLayout'
import { dayMonth, timeOfDay } from './format'
import { fmt } from './inches'
import { pieceSummary, sourceSummary } from './summary'
import { buildBlocks } from './sheetView'
import type { Block } from './sheetView'
import type { Derived } from './stock'
import type { CutDoc, Settings, SheetPlan } from './types'

/** One row of the printed parts table for one sheet — the same Sizes list shown on screen. */
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

function statusFor(entry: SizesListEntry): PrintPartRow['status'] {
  if (entry.group === 'piece') return entry.status === 'Turned' ? 'Turned piece' : 'Piece'
  if (entry.group === 'leftover') return 'Saved leftover'
  return entry.name === 'Waste' ? 'Waste' : 'Already cut'
}

/** The printed parts table is the same grouped Sizes list shown on screen (diagramLayout.ts). */
function partsTableFor(blocks: Block[]): PrintPartRow[] {
  return sizesList(blocks).map((entry) => {
    const [width, height] = entry.size.split(' × ')
    const label = entry.badges.length > 0 ? entry.badges.join(', ') : entry.name
    return { label, width, height, status: statusFor(entry) }
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
 * diagram geometry as the screen, and sizesList (diagramLayout.ts) for the SAME grouped
 * Sizes list shown on screen, so the parts table is never a second, divergent enumeration.
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
