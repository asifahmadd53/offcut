import { fmt, fmtLeft } from './inches'
import type { Block, BlockKind } from './sheetView'
import type { SheetPlan } from './types'

/**
 * Pure geometry for the simplified cutting-drawing SVG (no React). Everything here works
 * in inches in, pixel-layout data out, so it is fully unit-testable without a DOM.
 *
 * The drawing shows only the sheet outline and plain filled blocks, each with at most one
 * label. A block too small for its label gets a small badge instead. Every block's size is
 * always shown somewhere: either inside the drawing (label or badge) or in the Sizes list
 * below it — never neither (see `sizesList` and `everyBlockHasASize`).
 */

// ---------- One label per block ----------

export type LabelKind = 'inline' | 'badge'

export interface BlockLabelPlan {
  blockIndex: number
  kind: LabelKind
  /** First line inside the block (inline) or the badge text (badge). */
  line1: string
  /** Second line inside the block, only for 'inline'. */
  line2?: string
}

/** A block needs at least this many px to carry two lines of 12px text. */
const MIN_TWO_LINE_PW = 46
const MIN_TWO_LINE_PH = 30
/** A block needs at least this many px to carry one line of 11px text. */
const MIN_ONE_LINE_PW = 34
const MIN_ONE_LINE_PH = 16
/** A wide leftover gets one combined line, "A · 19 × 48", instead of two stacked lines. */
const MIN_WIDE_LEFTOVER_PW = 100

/** Piece size as typed, and its second line: "Turned" or "Piece N". */
function pieceLines(b: Block): { line1: string; line2: string } {
  const line1 = b.label ?? `${fmt(b.w)} × ${fmt(b.h)}`
  const line2 = b.rotated ? 'Turned' : b.n != null ? `Piece ${b.n}` : ''
  return { line1, line2 }
}

/** Leftover letter, its size short-side-first, and the combined one-line form. */
function leftoverLines(b: Block): { line1: string; line2: string; wide: string } {
  const letter = b.letter ?? ''
  const dims = fmtLeft(b.w, b.h)
  return { line1: letter, line2: dims, wide: `${letter} · ${dims}` }
}

/**
 * Chooses the single label for one block, or a badge when it's too small. Pieces (blue):
 * size then "Piece N" (or "Turned"). Leftovers (green): letter then size, short side first,
 * or one line "A · 19 × 48" when wide. Earlier cuts (grey) and waste: the size only, no
 * other words. A block too small for any of the above gets a badge: a number for pieces
 * and earlier/waste, a letter for leftovers.
 */
export function chooseBlockLabel(block: Block, blockIndex: number, pxPerInch: number): BlockLabelPlan {
  const pw = block.w * pxPerInch
  const ph = block.h * pxPerInch
  const kind = block.kind

  if (kind === 'cut') {
    const { line1, line2 } = pieceLines(block)
    if (pw >= MIN_TWO_LINE_PW && ph >= MIN_TWO_LINE_PH) return { blockIndex, kind: 'inline', line1, line2 }
    if (pw >= MIN_ONE_LINE_PW && ph >= MIN_ONE_LINE_PH) return { blockIndex, kind: 'inline', line1 }
    return { blockIndex, kind: 'badge', line1: block.n != null ? String(block.n) : '' }
  }

  if (kind === 'free' || kind === 'freeNew' || kind === 'focus') {
    const { line1, line2, wide } = leftoverLines(block)
    if (pw >= MIN_WIDE_LEFTOVER_PW) return { blockIndex, kind: 'inline', line1: wide }
    // A letter is one character and the size line is short, so leftovers need less width
    // than a piece's two lines (which include the word "Piece" or "Turned").
    if (pw >= MIN_ONE_LINE_PW && ph >= MIN_TWO_LINE_PH) return { blockIndex, kind: 'inline', line1, line2 }
    return { blockIndex, kind: 'badge', line1: line1 || '?' }
  }

  // earlier / waste: size only, muted text, no other words.
  const sizeText = `${fmt(block.w)} × ${fmt(block.h)}`
  if (pw >= MIN_ONE_LINE_PW && ph >= MIN_ONE_LINE_PH) return { blockIndex, kind: 'inline', line1: sizeText }
  return { blockIndex, kind: 'badge', line1: '' }
}

export function chooseAllLabels(blocks: Block[], pxPerInch: number): BlockLabelPlan[] {
  return blocks.map((b, i) => chooseBlockLabel(b, i, pxPerInch))
}

// ---------- Sizes list (grouped, sorted, real HTML data) ----------

export type SizesGroupKey = 'piece' | 'leftover' | 'earlier'

export interface SizesListEntry {
  group: SizesGroupKey
  /** Badge text(s) for the blocks this row represents, e.g. ["C2", "C3"]. */
  badges: string[]
  name: string
  /** Size as drawn, "23 × 77"-style (pieces keep typed order; others use fmt(w) x fmt(h)). */
  size: string
  status?: 'Turned'
  /** How many identical blocks this row represents. */
  count: number
}

function sizeTextFor(b: Block): string {
  if (b.kind === 'cut' && b.label) return b.label
  return `${fmt(b.w)} × ${fmt(b.h)}`
}

function badgeFor(b: Block): string {
  if (b.kind === 'cut') return b.n != null ? String(b.n) : ''
  if (b.kind === 'free' || b.kind === 'freeNew' || b.kind === 'focus') return b.letter ?? ''
  return ''
}

function groupFor(kind: BlockKind): SizesGroupKey {
  if (kind === 'cut') return 'piece'
  if (kind === 'earlier' || kind === 'waste') return 'earlier'
  return 'leftover'
}

function nameFor(b: Block): string {
  if (b.kind === 'cut') return b.n != null ? `Piece ${b.n}` : 'Piece'
  if (b.kind === 'earlier') return 'Already cut'
  if (b.kind === 'waste') return 'Waste'
  return b.letter ?? 'Leftover'
}

/**
 * Groups identical blocks (same group, size and turned state) into one row, e.g.
 * "C2, C3 · 1.6 × 18 (2 pieces)". Rows are sorted top to bottom, then left to right, by
 * the first block in the group, matching the reading order a carpenter would use.
 */
export function sizesList(blocks: Block[]): SizesListEntry[] {
  const order: Array<{ b: Block; i: number }> = blocks.map((b, i) => ({ b, i }))
  order.sort((a, b) => a.b.y - b.b.y || a.b.x - b.b.x)

  const groups = new Map<string, SizesListEntry & { sortY: number; sortX: number }>()
  for (const { b } of order) {
    const group = groupFor(b.kind)
    const size = sizeTextFor(b)
    const status = b.rotated ? ('Turned' as const) : undefined
    const name = b.kind === 'earlier' || b.kind === 'waste' ? nameFor(b) : ''
    const key = `${group}|${size}|${status ?? ''}|${name}`
    const badge = badgeFor(b)
    const existing = groups.get(key)
    if (existing) {
      if (badge) existing.badges.push(badge)
      existing.count += 1
    } else {
      groups.set(key, {
        group,
        badges: badge ? [badge] : [],
        name: nameFor(b),
        size,
        status,
        count: 1,
        sortY: b.y,
        sortX: b.x,
      })
    }
  }

  return [...groups.values()]
    .sort((a, b) => a.sortY - b.sortY || a.sortX - b.sortX)
    .map(({ sortY: _y, sortX: _x, ...entry }) => entry)
}

// ---------- Every block labelled or listed (the hard invariant) ----------

/**
 * True when every block's size is shown somewhere: inline inside the drawing (an 'inline'
 * label always carries the size in one form), or in the Sizes list, which always lists
 * every block regardless of on-screen size. A 'badge' alone does not carry the numeric
 * size on the drawing, so a badge-only block relies on the Sizes list — which is why this
 * function checks that the list's grouped counts add back up to every block, not just that
 * chooseAllLabels() ran without throwing.
 */
export function everyBlockHasASize(blocks: Block[], pxPerInch: number): boolean {
  // Labels are computed to confirm chooseBlockLabel never throws for any block kind/size;
  // the actual "has a size somewhere" guarantee is the Sizes list covering every block.
  chooseAllLabels(blocks, pxPerInch)
  const listedCount = sizesList(blocks).reduce((sum, e) => sum + e.count, 0)
  return listedCount === blocks.length
}

// ---------- Badge positions (blocks tile the sheet, so badges never collide) ----------

export interface BadgePosition {
  blockIndex: number
  cx: number
  cy: number
}

/** Badge centers are simply each block's own center — blocks never overlap each other
 *  (they tile the sheet), so badges never overlap either. No nudging needed. */
export function badgePositions(blocks: Block[]): BadgePosition[] {
  return blocks.map((b, blockIndex) => ({ blockIndex, cx: b.x + b.w / 2, cy: b.y + b.h / 2 }))
}

// ---------- Cut-line derivation (print keeps all lines; screen shows only the active one) ----------

export interface CutLineLayout {
  n: number
  kind: 'across' | 'down'
  pos: number
  from: number
  to: number
}

/**
 * Uses sheet.cuts when present (the exact structured data from packer.ts). For older
 * records without it, returns an empty array — callers fall back to the plain-text
 * Cut order list with no highlighting available.
 */
export function cutLinesFor(sheet: Pick<SheetPlan, 'cuts'>): CutLineLayout[] {
  return sheet.cuts ?? []
}

// ---------- Aria label ----------

export function diagramAriaLabel(
  sheetW: number,
  sheetH: number,
  pieceCount: number,
  leftoverCount: number,
  cutCount?: number,
): string {
  const base = `Sheet ${sheetW} by ${sheetH} inches with ${pieceCount} pieces and ${leftoverCount} leftovers`
  return cutCount != null ? `${base} and ${cutCount} cuts` : base
}
