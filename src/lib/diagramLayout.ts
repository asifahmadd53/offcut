import { fmt, fmtLeft } from './inches'
import type { Block } from './sheetView'
import type { SheetPlan } from './types'

/**
 * Pure geometry for the technical cutting-drawing SVG (no React). Everything here works in
 * inches in, pixel-layout data out, so it is fully unit-testable without a DOM.
 */

// ---------- Label choice (folds in labelChoice.ts's chooseFreeLabel) ----------

export type PieceLabelKind = 'two-line' | 'one-line' | 'legend'
export interface PieceLabelPlan {
  kind: PieceLabelKind
  line1: string
  line2?: string
}

export type FreeLabelKind = 'wide' | 'stacked' | 'badge'
export interface FreeLabelChoice {
  kind: FreeLabelKind
  letter: string
  dims: string
  /** Only meaningful for 'wide': whether "free" fits alongside the size. */
  showFree: boolean
}

/**
 * Picks how to label a free / freeNew / focus block on the diagram, given its on-screen
 * size in pixels. A letter is never shown alone when the size can be shown in some form
 * (R15 / C4: every free block must carry its size, not just its letter). Never rotated
 * text: a block too narrow/short for the normal forms falls back to a callout instead
 * (see blockCallouts), the same as any other block kind.
 */
export function chooseFreeLabel(letter: string, w: number, h: number, pw: number, ph: number): FreeLabelChoice {
  const dims = fmtLeft(w, h)

  if (pw >= 110) {
    return { kind: 'wide', letter, dims, showFree: true }
  }
  if (pw >= 40 && ph >= 34) {
    return { kind: 'stacked', letter, dims, showFree: false }
  }
  return { kind: 'badge', letter, dims, showFree: false }
}

/** Chooses how to label a 'cut' (piece) block, given its on-screen size in pixels. */
export function choosePieceLabel(block: Block, pw: number, ph: number): PieceLabelPlan {
  const size = block.label ?? ''
  const second = block.rotated ? 'Turned' : block.n != null ? `Piece ${block.n}` : ''
  if (pw >= 52 && ph >= 34) {
    return { kind: 'two-line', line1: size, line2: second }
  }
  if (pw >= 36 && ph >= 16) {
    return { kind: 'one-line', line1: size }
  }
  return { kind: 'legend', line1: size, line2: second }
}

export type EarlierLabelKind = 'two-line' | 'one-line' | 'legend'
export interface EarlierLabelPlan {
  kind: EarlierLabelKind
  /** The size, drawn as any other block ("30 × 48"). */
  line1: string
  /** "Already cut", shown only when there's room for a second line. */
  line2?: string
}

/**
 * Chooses how to label an already-cut ('earlier') block: its size always, "Already cut"
 * as a second line only when there's room. Same thresholds as a piece, since both are
 * plain rectangles with a two-line label — earlier blocks just use muted colours and no
 * hatching instead of the piece's blue fill.
 */
export function chooseEarlierLabel(block: Block, pw: number, ph: number): EarlierLabelPlan {
  const size = `${fmt(block.w)} × ${fmt(block.h)}`
  if (pw >= 52 && ph >= 34) {
    return { kind: 'two-line', line1: size, line2: 'Already cut' }
  }
  if (pw >= 36 && ph >= 16) {
    return { kind: 'one-line', line1: size }
  }
  return { kind: 'legend', line1: size }
}

/**
 * Unified label chooser for any block kind, in inches -> pixels via pxPerInch. Pieces get
 * choosePieceLabel; free/freeNew/focus get chooseFreeLabel folded into the same shape.
 */
export interface LabelPlan {
  kind: 'piece' | 'free' | 'earlier'
  piece?: PieceLabelPlan
  free?: FreeLabelChoice
  earlier?: EarlierLabelPlan
}

export function chooseLabel(block: Block, pxPerInch: number): LabelPlan {
  const pw = block.w * pxPerInch
  const ph = block.h * pxPerInch
  if (block.kind === 'cut') {
    return { kind: 'piece', piece: choosePieceLabel(block, pw, ph) }
  }
  if (block.kind === 'earlier' || block.kind === 'waste') {
    return { kind: 'earlier', earlier: chooseEarlierLabel(block, pw, ph) }
  }
  return { kind: 'free', free: chooseFreeLabel(block.letter ?? '', block.w, block.h, pw, ph) }
}

/**
 * Free/freeNew/focus blocks that fall back to a badge at this scale, so a caller can add
 * their size to a legend beside the diagram even though the block itself only shows a dot.
 */
export function badgedLeftovers(blocks: Block[], scale: number): Array<{ letter: string; dims: string }> {
  return blocks
    .filter((b) => b.kind === 'free' || b.kind === 'freeNew' || b.kind === 'focus')
    .map((b) => chooseFreeLabel(b.letter ?? '', b.w, b.h, b.w * scale, b.h * scale))
    .filter((choice) => choice.kind === 'badge')
    .map(({ letter, dims }) => ({ letter, dims }))
}

// ---------- Unified callouts: every block's size is always shown somewhere ----------

export interface BlockCallout {
  blockIndex: number
  /** The text to show in the dotted callout, e.g. "B · 2 × 77 free" or "30 × 48". */
  text: string
  /** Anchor point on the block's own edge the leader line starts from, in px relative
   *  to the sheet's own origin (the caller adds its own margin offset when drawing). */
  anchorX: number
  anchorY: number
  /** Stacked, non-overlapping y position for this callout's text (via nudgeLabels),
   *  in the same px space as anchorY. */
  y: number
}

/**
 * Shortens callout text to fit `maxWidthPx` at 11px: first drops the " free" suffix, then
 * drops the "letter · " prefix, then hard-truncates with an ellipsis. Guarantees the
 * returned string's estimated width never exceeds maxWidthPx (unless even a single
 * character doesn't fit, which can't happen at any sane RIGHT_MARGIN/font size).
 */
export function fitCalloutText(text: string, maxWidthPx: number, measure: Measure = estimateTextWidth): string {
  if (measure(text, 11) <= maxWidthPx) return text
  const noFree = text.replace(/ free$/, '')
  if (measure(noFree, 11) <= maxWidthPx) return noFree
  const noPrefix = noFree.replace(/^[^·]+·\s*/, '')
  if (measure(noPrefix, 11) <= maxWidthPx) return noPrefix
  let cur = noPrefix
  while (cur.length > 1 && measure(cur + '…', 11) > maxWidthPx) {
    cur = cur.slice(0, -1)
  }
  return cur.length < noPrefix.length ? cur + '…' : cur
}

export type Measure = (text: string, fontSize: number) => number

/**
 * Every block whose chosen label is too small to draw inline (a piece's 'legend', a free
 * block's 'badge', or an earlier/waste block's 'legend') gets a dotted callout outside the
 * sheet instead, so its size is never lost (R15) and never drawn as rotated text. Several
 * callouts on one sheet are stacked vertically via nudgeLabels so their text never touches.
 * `maxTextWidthPx` (the caller's own RIGHT_MARGIN budget, minus the leader-line length) is
 * enforced via fitCalloutText so a callout's text can never run past its own drawing box —
 * this is the direct fix for callout text overlapping neighbouring content outside the box.
 */
export function blockCallouts(
  blocks: Block[],
  pxPerInch: number,
  maxTextWidthPx = Infinity,
  measure: Measure = estimateTextWidth,
): BlockCallout[] {
  const seeds = blocks
    .map((b, blockIndex) => {
      const pw = b.w * pxPerInch
      const ph = b.h * pxPerInch
      const plan = chooseLabel(b, pxPerInch)
      let text: string | null = null
      if (plan.kind === 'piece' && plan.piece!.kind === 'legend') {
        text = plan.piece!.line1
      } else if (plan.kind === 'free' && plan.free!.kind === 'badge') {
        text = `${plan.free!.letter} · ${plan.free!.dims} free`
      } else if (plan.kind === 'earlier' && plan.earlier!.kind === 'legend') {
        text = plan.earlier!.line1
      }
      if (text === null) return null
      text = fitCalloutText(text, maxTextWidthPx, measure)
      const anchorX = b.x * pxPerInch + pw
      const anchorY = b.y * pxPerInch + ph / 2
      return { blockIndex, text, anchorX, anchorY }
    })
    .filter((s): s is NonNullable<typeof s> => s !== null)

  // maxNudgeFactor: Infinity — a callout is the one place a too-small block's size is
  // shown at all (R15), so it must never be dropped, however far down the page it has to
  // be nudged to stay non-overlapping with the others.
  const { placed } = nudgeLabels(
    seeds.map((s, i) => ({ center: s.anchorY, text: String(i), halfWidth: 7 })),
    6,
    Infinity,
  )
  const byId = new Map(seeds.map((s, i) => [String(i), s]))
  return placed.map((p) => {
    const seed = byId.get(p.text)!
    return { blockIndex: seed.blockIndex, text: seed.text, anchorX: seed.anchorX, anchorY: seed.anchorY, y: p.center }
  })
}

// ---------- Waste-cell computation ----------

export interface WasteCell {
  x: number
  y: number
  w: number
  h: number
}

/**
 * Coordinate-compression over the unique x/y edges of all blocks plus the region boundary.
 * Any grid cell not covered by a block is waste (this also naturally captures kerf gaps as
 * thin waste strips, with no special-casing).
 */
export function computeWasteCells(
  blocks: Block[],
  region: { x: number; y: number; w: number; h: number },
): WasteCell[] {
  const EPS = 1e-6
  const xs = new Set<number>([region.x, region.x + region.w])
  const ys = new Set<number>([region.y, region.y + region.h])
  for (const b of blocks) {
    xs.add(b.x)
    xs.add(b.x + b.w)
    ys.add(b.y)
    ys.add(b.y + b.h)
  }
  const xArr = [...xs].sort((a, b) => a - b)
  const yArr = [...ys].sort((a, b) => a - b)

  const cells: WasteCell[] = []
  for (let i = 0; i < xArr.length - 1; i++) {
    const cx = xArr[i]
    const cw = xArr[i + 1] - cx
    if (cw <= EPS) continue
    for (let j = 0; j < yArr.length - 1; j++) {
      const cy = yArr[j]
      const ch = yArr[j + 1] - cy
      if (ch <= EPS) continue
      const midX = cx + cw / 2
      const midY = cy + ch / 2
      const covered = blocks.some(
        (b) => midX > b.x + EPS && midX < b.x + b.w - EPS && midY > b.y + EPS && midY < b.y + b.h - EPS,
      )
      if (!covered) cells.push({ x: cx, y: cy, w: cw, h: ch })
    }
  }
  return mergeWasteCells(cells)
}

/** Merges adjacent same-height waste cells sharing a y-band into fewer wider rectangles. */
function mergeWasteCells(cells: WasteCell[]): WasteCell[] {
  const EPS = 1e-6
  const byBand = new Map<string, WasteCell[]>()
  for (const c of cells) {
    const key = `${c.y.toFixed(4)}|${c.h.toFixed(4)}`
    const arr = byBand.get(key) ?? []
    arr.push(c)
    byBand.set(key, arr)
  }
  const merged: WasteCell[] = []
  for (const arr of byBand.values()) {
    arr.sort((a, b) => a.x - b.x)
    let cur: WasteCell | null = null
    for (const c of arr) {
      if (cur && Math.abs(cur.x + cur.w - c.x) < EPS) {
        cur.w += c.w
      } else {
        if (cur) merged.push(cur)
        cur = { ...c }
      }
    }
    if (cur) merged.push(cur)
  }
  return merged
}

/** A waste cell is only worth the "Waste" text if it is roughly as big as a small leftover. */
export function wasteLabelFits(pw: number, ph: number): boolean {
  return pw >= 40 && ph >= 24
}

// ---------- Dimension-line edges ----------

/** Unique sorted x (or y) edges of the given blocks, clipped to the region span. */
export function extractEdges(blocks: Block[], axis: 'x' | 'y', regionStart: number, regionSize: number): number[] {
  const EPS = 1e-6
  const set = new Set<number>([regionStart, regionStart + regionSize])
  for (const b of blocks) {
    const start = axis === 'x' ? b.x : b.y
    const size = axis === 'x' ? b.w : b.h
    if (start >= regionStart - EPS && start <= regionStart + regionSize + EPS) set.add(start)
    const end = start + size
    if (end >= regionStart - EPS && end <= regionStart + regionSize + EPS) set.add(end)
  }
  return [...set].sort((a, b) => a - b)
}

export interface Segment {
  from: number
  to: number
  size: number
  label: string
}

/** Consecutive segments between edges, each carrying its formatted size. */
export function edgesToSegments(edges: number[]): Segment[] {
  const segs: Segment[] = []
  for (let i = 0; i < edges.length - 1; i++) {
    const from = edges[i]
    const to = edges[i + 1]
    const size = to - from
    if (size <= 1e-6) continue
    segs.push({ from, to, size, label: fmt(size) })
  }
  return segs
}

// ---------- Label-collision nudging for dimension-segment labels ----------

export interface PlacedLabel {
  /** Center position along the axis, in px. */
  center: number
  text: string
  /** Half-width of the rendered label, in px (approximate, from text length). */
  halfWidth: number
}

export interface NudgeResult {
  /** Labels that fit, each with a possibly-adjusted center and a flag for whether it needed
   *  a leader line (nudged away from its natural center). */
  placed: Array<{ center: number; text: string; leader: boolean; naturalCenter: number }>
  /** Labels that could not be placed even after nudging; render these as extra text below
   *  the SVG instead. */
  overflow: string[]
}

/**
 * Greedily nudges label centers apart, left to right, so adjacent labels never overlap.
 * A label nudged more than its own width away from its natural center is flagged so the
 * caller can draw a short leader line back to its segment. If nudging cannot resolve an
 * overlap within `maxNudgeFactor` × the label's own half-width (segment too narrow, labels
 * packed too tight), that label is dropped to `overflow` — this only ever applies to
 * dimension-segment labels, whose size text is never the sole place a size is shown (the
 * block itself still carries it). `blockCallouts` below passes `Infinity` so a callout,
 * which IS the only place a too-small block's size is shown (R15), is never dropped —
 * `placed` is still guaranteed collision-free either way, since the core greedy placement
 * (not the drop threshold) is what prevents overlap.
 */
export function nudgeLabels(labels: PlacedLabel[], minGap = 2, maxNudgeFactor = 4): NudgeResult {
  const sorted = [...labels].sort((a, b) => a.center - b.center)
  const placed: NudgeResult['placed'] = []
  const overflow: string[] = []
  let lastRightEdge = -Infinity

  for (const lbl of sorted) {
    let center = lbl.center
    const leftEdge = () => center - lbl.halfWidth
    if (leftEdge() < lastRightEdge + minGap) {
      center = lastRightEdge + minGap + lbl.halfWidth
    }
    const movedBy = Math.abs(center - lbl.center)
    if (movedBy > lbl.halfWidth * maxNudgeFactor) {
      // Nudging this far means the row is too crowded; drop it to the overflow list
      // instead of stacking labels illegibly on top of each other.
      overflow.push(lbl.text)
      continue
    }
    placed.push({ center, text: lbl.text, leader: movedBy > lbl.halfWidth, naturalCenter: lbl.center })
    lastRightEdge = center + lbl.halfWidth
  }
  return { placed, overflow }
}

/** Rough text width estimate in px for 12px medium-weight labels (no DOM available in tests). */
export function estimateTextWidth(text: string, fontSize = 12): number {
  return text.length * fontSize * 0.58
}

// ---------- Rectangle size labels (edge labels or callouts) ----------

export interface RectSizeLabel {
  /** Index into the blocks array this label describes. */
  blockIndex: number
  kind: Block['kind']
  /** Width as drawn (fmt of block.w), used along the top edge. */
  width: string
  /** Height as drawn (fmt of block.h), used along the left edge. */
  height: string
  /** Display name inside the rectangle: "Piece 1", "A", "Waste", "Already cut". */
  name: string
  /** Whether this rectangle is big enough to carry its own edge labels, or needs a callout. */
  placement: 'inside-edges' | 'callout'
  /** Rect center in inches, used to place/stack callouts. */
  cx: number
  cy: number
}

/** A rectangle needs at least this many px along the top/left to fit small edge labels. */
const MIN_EDGE_PW = 34
const MIN_EDGE_PH = 20

function nameFor(b: Block): string {
  if (b.kind === 'cut') return b.n != null ? `Piece ${b.n}` : 'Piece'
  if (b.kind === 'earlier') return 'Already cut'
  if (b.kind === 'free' || b.kind === 'freeNew' || b.kind === 'focus') return b.letter ?? 'Leftover'
  return 'Waste'
}

/**
 * Every rectangle drawn on a sheet (pieces, leftovers, waste, earlier-cut blocks) paired
 * with its width/height as drawn and where to put that size: inline along the top/left
 * edges when there's room, or flagged for a callout when the rectangle is too small.
 * Pieces show the size as typed (block.label, already "23 × 77"-style from packer.ts);
 * everything else shows fmt(w) x fmt(h) in on-diagram orientation (not fmtLeft's
 * short-side-first, which is only for the existing internal leftover chip/badge label).
 * Pure and DOM-free so both SheetDiagram (screen) and the print builder can share it.
 */
export function allRectSizeLabels(blocks: Block[], pxPerInch: number): RectSizeLabel[] {
  return blocks.map((b, blockIndex) => {
    const pw = b.w * pxPerInch
    const ph = b.h * pxPerInch
    const width = b.kind === 'cut' && b.label ? b.label.split(' × ')[0] : fmt(b.w)
    const height = b.kind === 'cut' && b.label ? b.label.split(' × ')[1] : fmt(b.h)
    const placement: RectSizeLabel['placement'] = pw >= MIN_EDGE_PW && ph >= MIN_EDGE_PH ? 'inside-edges' : 'callout'
    return {
      blockIndex,
      kind: b.kind,
      width,
      height,
      name: nameFor(b),
      placement,
      cx: b.x + b.w / 2,
      cy: b.y + b.h / 2,
    }
  })
}

export interface CalloutLayout {
  blockIndex: number
  text: string
  /** y position (px) of this callout's text line, stacked top-to-bottom without overlap. */
  y: number
  /** Natural (unstacked) y this callout's leader line points back to. */
  naturalY: number
}

/**
 * Stacks callout text lines vertically so they never overlap, reusing nudgeLabels'
 * greedy 1-D collision-avoidance algorithm (rotated 90 degrees: callouts stack in y
 * instead of nudging in x). One collision algorithm serves both dimension-line label
 * crowding and callout stacking rather than a second bespoke implementation.
 */
export function stackCallouts(
  callouts: Array<{ blockIndex: number; text: string; naturalY: number }>,
  lineHeight = 14,
): CalloutLayout[] {
  const labels: PlacedLabel[] = callouts.map((c) => ({
    center: c.naturalY,
    text: c.text,
    halfWidth: lineHeight / 2,
  }))
  const { placed } = nudgeLabels(labels, 2)
  const byText = new Map(callouts.map((c) => [c.text, c]))
  return placed.map((p) => {
    const src = byText.get(p.text)!
    return { blockIndex: src.blockIndex, text: p.text, y: p.center, naturalY: p.naturalCenter }
  })
}

// ---------- Cut-line derivation ----------

export interface CutLineLayout {
  n: number
  kind: 'across' | 'down'
  pos: number
  from: number
  to: number
}

/**
 * Uses sheet.cuts when present (the exact structured data from packer.ts). For older
 * records without it, returns an empty array — callers should fall back to plain-text
 * Cut order (sheet.steps) with no numbered lines/circles drawn.
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
