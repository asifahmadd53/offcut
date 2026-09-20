import { fmt } from './inches'
import { plural } from './format'
import type { CutDoc, Piece, SheetPlan } from './types'

/** "23 × 77, 2 pcs" or "23 × 77, 2 pcs +1 more" */
export function pieceSummary(pieces: Piece[] = []): string {
  if (pieces.length === 0) return 'No pieces'
  const first = pieces[0]
  const text = `${fmt(first.w)} × ${fmt(first.h)}, ${plural(first.qty, 'pc')}`
  return pieces.length > 1 ? `${text} +${pieces.length - 1} more` : text
}

/** "new sheet", "from leftover", "leftover + new sheet" */
export function sourceSummary(sheets: SheetPlan[]): string {
  const fresh = sheets.filter((s) => s.isNew).length
  const reused = sheets.length - fresh
  if (fresh > 0 && reused > 0) return 'leftover + new sheet'
  if (reused > 0) return 'from leftover'
  return fresh > 1 ? `${fresh} new sheets` : 'new sheet'
}

export const jobTitle = (cut: CutDoc) => pieceSummary(cut.pieces)
