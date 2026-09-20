import { fmt, fmtLeft } from './inches'
import type { Block } from './sheetView'

/**
 * Pure label-planning for the sheet drawing: given blocks already placed in pixel space,
 * decide exactly how each one is labelled so text never overflows its own block and never
 * overlaps another block's label, a dimension number, a badge or a callout. No React, no
 * DOM required to run the planning itself — the caller supplies a `measure` function so
 * tests can use a cheap estimate and the real component can use real canvas/SVG measurement.
 */

export type Measure = (text: string, fontSizePx: number) => number

/** Simple character-based estimate, close enough for tests; the live component measures
 *  the real rendered text instead once the font has loaded. */
export const estimateTextWidth: Measure = (text, fontSizePx) => text.length * fontSizePx * 0.56

const FONT_SIZES = [13, 12, 11]
const PADDING = 4
const LINE_HEIGHT = 13

export interface BlockText {
  /** The block's own name/letter for a badge ("1", "A", "B"). */
  badgeLabel: string
  /** The size text, e.g. "23 × 77" (pieces, typed order) or "19 × 48" (fmtLeft, others). */
  size: string
  /** Second line shown only inline, only when there's room: "Piece 1", "Turned",
   *  "Already cut", "free". Never shown in a badge or the Sizes list entry itself. */
  detail?: string
}

/** What a block's own name/letter/size text is, independent of whether it fits anywhere. */
export function blockText(b: Block): BlockText {
  if (b.kind === 'cut') {
    return {
      badgeLabel: b.n != null ? String(b.n) : '?',
      size: b.label ?? `${fmt(b.w)} × ${fmt(b.h)}`,
      detail: b.rotated ? 'Turned' : b.n != null ? `Piece ${b.n}` : undefined,
    }
  }
  if (b.kind === 'earlier' || b.kind === 'waste') {
    return {
      badgeLabel: b.n != null ? String(b.n) : '•',
      size: `${fmt(b.w)} × ${fmt(b.h)}`,
      detail: b.kind === 'earlier' ? 'Already cut' : undefined,
    }
  }
  // free / freeNew / focus
  return {
    badgeLabel: b.letter ?? '?',
    size: fmtLeft(b.w, b.h),
    detail: 'free',
  }
}

export type LabelKind = 'inline-one-line' | 'inline-two-line' | 'badge' | 'callout'

export interface BlockLabelPlan {
  blockIndex: number
  kind: LabelKind
  /** Text lines actually drawn inside the block (inline kinds only). */
  lines: string[]
  fontSize: number
  /** The label's own bounding box in px, relative to the sheet's origin (not the block's). */
  box: { x: number; y: number; w: number; h: number }
}

/**
 * Tries every combination of font size (13 down to 11) and line count (one line "W × H",
 * or two lines "W" / "× H") and returns the largest that fits inside the block with
 * PADDING px clearance on every side, or null if nothing fits at any size.
 */
function fitInline(
  size: string,
  pw: number,
  ph: number,
  measure: Measure,
): { lines: string[]; fontSize: number; textW: number; textH: number } | null {
  const availW = pw - PADDING * 2
  const availH = ph - PADDING * 2
  if (availW <= 0 || availH <= 0) return null

  for (const fontSize of FONT_SIZES) {
    // One line first: "W × H" fits, and the block is at least tall enough for one line.
    const oneLineW = measure(size, fontSize)
    if (oneLineW <= availW && LINE_HEIGHT <= availH) {
      return { lines: [size], fontSize, textW: oneLineW, textH: LINE_HEIGHT }
    }
  }

  // One line never fit at any size: try splitting "W × H" onto two lines, "W" / "× H".
  const parts = size.split(' × ')
  if (parts.length === 2) {
    const twoLines = [parts[0], `× ${parts[1]}`]
    for (const fontSize of FONT_SIZES) {
      const w = Math.max(measure(twoLines[0], fontSize), measure(twoLines[1], fontSize))
      const h = LINE_HEIGHT * 2
      if (w <= availW && h <= availH) {
        return { lines: twoLines, fontSize, textW: w, textH: h }
      }
    }
  }
  return null
}

/**
 * Tries to also fit a detail line ("Piece 1", "Already cut", "free") below the size,
 * only at the smallest size that still fits the size line alone, so a two-line inline
 * label never shrinks the size text just to make room for the detail word.
 */
function fitInlineWithDetail(
  size: string,
  detail: string | undefined,
  pw: number,
  ph: number,
  measure: Measure,
): { lines: string[]; fontSize: number } | null {
  const sizeOnly = fitInline(size, pw, ph, measure)
  if (!sizeOnly) return null
  if (!detail || sizeOnly.lines.length > 1) return { lines: sizeOnly.lines, fontSize: sizeOnly.fontSize }

  const availW = pw - PADDING * 2
  const availH = ph - PADDING * 2
  const detailH = sizeOnly.textH + LINE_HEIGHT
  const detailW = measure(detail, sizeOnly.fontSize)
  if (detailH <= availH && Math.max(sizeOnly.textW, detailW) <= availW) {
    return { lines: [sizeOnly.lines[0], detail], fontSize: sizeOnly.fontSize }
  }
  return { lines: sizeOnly.lines, fontSize: sizeOnly.fontSize }
}

export interface PlanLabelsResult {
  labels: BlockLabelPlan[]
  /** Blocks that got neither an inline label nor a callout, so the caller must show
   *  them as a badge; every one of these also needs a Sizes-list row. */
  badgeIndices: Set<number>
}

/**
 * Plans every block's label: inline (one or two lines, largest font that fits, with an
 * optional detail line) when there's room, otherwise a badge. This function only decides
 * inline vs badge — callout promotion and collision demotion happen in resolveOverlaps.
 */
export function planInlineLabels(blocks: Block[], pxPerInch: number, measure: Measure = estimateTextWidth): BlockLabelPlan[] {
  return blocks.map((b, blockIndex) => {
    const pw = b.w * pxPerInch
    const ph = b.h * pxPerInch
    const text = blockText(b)
    const fit = fitInlineWithDetail(text.size, text.detail, pw, ph, measure)

    if (!fit) {
      return {
        blockIndex,
        kind: 'badge' as const,
        lines: [],
        fontSize: 0,
        box: { x: b.x * pxPerInch + pw / 2 - 8, y: b.y * pxPerInch + ph / 2 - 8, w: 16, h: 16 },
      }
    }

    const textW = Math.max(...fit.lines.map((l) => measure(l, fit.fontSize)))
    const textH = fit.lines.length * LINE_HEIGHT
    const cx = b.x * pxPerInch + pw / 2
    const cy = b.y * pxPerInch + ph / 2
    return {
      blockIndex,
      kind: (fit.lines.length > 1 ? 'inline-two-line' : 'inline-one-line') as LabelKind,
      lines: fit.lines,
      fontSize: fit.fontSize,
      box: { x: cx - textW / 2, y: cy - textH / 2, w: textW, h: textH },
    }
  })
}

function boxesOverlap(a: BlockLabelPlan['box'], b: BlockLabelPlan['box']): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

/**
 * After inline labels are planned, some may still overlap each other (adjacent small
 * blocks whose text boxes cross into the neighbour) or a dimension number. Demote the
 * smaller block's label to a badge first (a badge takes far less room), then re-check,
 * until nothing overlaps. `otherBoxes` are fixed obstacles (dimension numbers, the
 * sheet ruler) that never move and are never demoted.
 */
export function resolveLabelOverlaps(
  blocks: Block[],
  labels: BlockLabelPlan[],
  otherBoxes: Array<{ x: number; y: number; w: number; h: number }> = [],
): BlockLabelPlan[] {
  const result = labels.map((l) => ({ ...l }))
  const areaOf = (i: number) => blocks[i].w * blocks[i].h

  let changed = true
  while (changed) {
    changed = false
    const inlineIdx = result
      .map((l, i) => ({ l, i }))
      .filter(({ l }) => l.kind !== 'badge')

    for (let a = 0; a < inlineIdx.length && !changed; a++) {
      for (let b = a + 1; b < inlineIdx.length && !changed; b++) {
        const { l: la, i: ia } = inlineIdx[a]
        const { l: lb, i: ib } = inlineIdx[b]
        if (boxesOverlap(la.box, lb.box)) {
          // Smallest block's label yields first — it's the one more likely to be
          // crowded by its neighbours, and losing detail there reads more naturally.
          const demote = areaOf(ia) <= areaOf(ib) ? ia : ib
          result[demote] = toBadge(demote, result[demote])
          changed = true
        }
      }
    }
    if (changed) continue

    for (const { l, i } of inlineIdx) {
      if (otherBoxes.some((ob) => boxesOverlap(l.box, ob))) {
        result[i] = toBadge(i, result[i])
        changed = true
        break
      }
    }
  }

  return result
}

function toBadge(blockIndex: number, prev: BlockLabelPlan): BlockLabelPlan {
  const cx = prev.box.x + prev.box.w / 2
  const cy = prev.box.y + prev.box.h / 2
  return { blockIndex, kind: 'badge', lines: [], fontSize: 0, box: { x: cx - 8, y: cy - 8, w: 16, h: 16 } }
}

// ---------- Callouts: at most 2, for the biggest blocks that still don't fit ----------

const MAX_CALLOUTS = 2

export interface Callout {
  blockIndex: number
  text: string
  /** Leader line start (on the block's own edge) and end (the label position), in the
   *  same px space as BlockLabelPlan boxes. */
  fromX: number
  fromY: number
  toX: number
  toY: number
}

/**
 * Promotes at most MAX_CALLOUTS of the badge-kind blocks — the biggest ones by area, so
 * the callouts carry the sizes most worth reading at a glance — into a stacked column of
 * leader-line callouts on the right, evenly spaced so their short straight leader lines
 * never cross each other or another label. Every other badge-kind block stays a plain
 * badge and is listed in the Sizes list instead (buildSizesList).
 */
export function planCallouts(
  blocks: Block[],
  labels: BlockLabelPlan[],
  sheetRightEdgeX: number,
  topY: number,
  bottomY: number,
): { callouts: Callout[]; promoted: Set<number> } {
  const badgeEntries = labels
    .filter((l) => l.kind === 'badge')
    .map((l) => ({ label: l, area: blocks[l.blockIndex].w * blocks[l.blockIndex].h }))
    .sort((a, b) => b.area - a.area)
    .slice(0, MAX_CALLOUTS)
    .sort((a, b) => a.label.box.y - b.label.box.y) // stack top-to-bottom in sheet order

  if (badgeEntries.length === 0) return { callouts: [], promoted: new Set() }

  const usableHeight = Math.max(bottomY - topY, 1)
  const step = usableHeight / (badgeEntries.length + 1)

  const callouts: Callout[] = badgeEntries.map(({ label }, i) => {
    const b = blocks[label.blockIndex]
    const text = blockText(b)
    const calloutText = `${text.badgeLabel} · ${text.size}${text.detail === 'free' ? ' free' : ''}`
    return {
      blockIndex: label.blockIndex,
      text: calloutText,
      fromX: label.box.x + label.box.w,
      fromY: label.box.y + label.box.h / 2,
      toX: sheetRightEdgeX,
      toY: topY + step * (i + 1),
    }
  })

  return { callouts, promoted: new Set(callouts.map((c) => c.blockIndex)) }
}

/** True if any two callout leader lines cross, or a leader line crosses a label box. */
export function calloutsCrossAnything(callouts: Callout[], labelBoxes: BlockLabelPlan['box'][]): boolean {
  for (let i = 0; i < callouts.length; i++) {
    for (let j = i + 1; j < callouts.length; j++) {
      if (segmentsCross(callouts[i], callouts[j])) return true
    }
  }
  for (const c of callouts) {
    for (const box of labelBoxes) {
      if (segmentIntersectsBox(c, box)) return true
    }
  }
  return false
}

function segmentsCross(
  a: { fromX: number; fromY: number; toX: number; toY: number },
  b: { fromX: number; fromY: number; toX: number; toY: number },
): boolean {
  const d = (px: number, py: number, qx: number, qy: number, rx: number, ry: number) =>
    (qx - px) * (ry - py) - (qy - py) * (rx - px)
  const d1 = d(a.fromX, a.fromY, a.toX, a.toY, b.fromX, b.fromY)
  const d2 = d(a.fromX, a.fromY, a.toX, a.toY, b.toX, b.toY)
  const d3 = d(b.fromX, b.fromY, b.toX, b.toY, a.fromX, a.fromY)
  const d4 = d(b.fromX, b.fromY, b.toX, b.toY, a.toX, a.toY)
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
}

function segmentIntersectsBox(
  seg: { fromX: number; fromY: number; toX: number; toY: number },
  box: { x: number; y: number; w: number; h: number },
): boolean {
  // Cheap conservative check: does the segment's bounding box overlap the label box?
  // Good enough here since leader lines are short and near-horizontal.
  const segMinX = Math.min(seg.fromX, seg.toX)
  const segMaxX = Math.max(seg.fromX, seg.toX)
  const segMinY = Math.min(seg.fromY, seg.toY)
  const segMaxY = Math.max(seg.fromY, seg.toY)
  return segMinX < box.x + box.w && segMaxX > box.x && segMinY < box.y + box.h && segMaxY > box.y
}

// ---------- Sizes list: every badge block, grouped when identical ----------

export interface SizesListEntry {
  badgeLabels: string[]
  size: string
  count: number
}

/**
 * Every block that ended up a plain badge (not promoted to a callout) is listed here,
 * grouped by identical size so several tiny identical strips read as one row, e.g.
 * "1, 2 · 1.6 × 18 (2 pieces)". Sorted top to bottom, then left to right.
 */
export function buildSizesList(blocks: Block[], badgeBlockIndices: number[]): SizesListEntry[] {
  const ordered = [...badgeBlockIndices].sort((i, j) => blocks[i].y - blocks[j].y || blocks[i].x - blocks[j].x)
  const groups = new Map<string, SizesListEntry & { sortY: number; sortX: number }>()

  for (const i of ordered) {
    const b = blocks[i]
    const text = blockText(b)
    const key = text.size
    const existing = groups.get(key)
    if (existing) {
      existing.badgeLabels.push(text.badgeLabel)
      existing.count += 1
    } else {
      groups.set(key, {
        badgeLabels: [text.badgeLabel],
        size: text.size,
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

// ---------- Dimension-line segments: merge or drop when too narrow for their number ----------

export interface DimSegment {
  from: number
  to: number
  /** Formatted size text, or a merged range's combined size when bracketed together. */
  label: string
  /** True when this entry represents two or more original segments merged into one bracket. */
  merged: boolean
}

/**
 * Segments too narrow to hold their own number (at the smallest font, with padding) are
 * merged with a neighbour into one bracketed span with one combined number, or — if even
 * a merge can't make room — dropped from the dimension line entirely (their real size is
 * still in the Sizes list via the block itself, never lost, just not repeated here).
 */
export function planDimensionSegments(
  edges: number[],
  pxPerInch: number,
  measure: Measure = estimateTextWidth,
): DimSegment[] {
  const raw: DimSegment[] = []
  for (let i = 0; i < edges.length - 1; i++) {
    const from = edges[i]
    const to = edges[i + 1]
    if (to - from <= 1e-6) continue
    raw.push({ from, to, label: fmt(to - from), merged: false })
  }

  const fits = (seg: DimSegment) => {
    const pw = (seg.to - seg.from) * pxPerInch
    return measure(seg.label, 11) + PADDING * 2 <= pw
  }

  const result: DimSegment[] = []
  let i = 0
  while (i < raw.length) {
    const seg = raw[i]
    if (fits(seg)) {
      result.push(seg)
      i++
      continue
    }
    // Try merging with the next segment into one bracket.
    if (i + 1 < raw.length) {
      const merged: DimSegment = {
        from: seg.from,
        to: raw[i + 1].to,
        label: fmt(raw[i + 1].to - seg.from),
        merged: true,
      }
      if (fits(merged)) {
        result.push(merged)
        i += 2
        continue
      }
    }
    // Can't merge into something that fits either: drop it. Its size still lives on
    // the block itself (inline label, badge or callout), never lost — just not
    // repeated a second time on a dimension line with no room for it.
    i++
  }
  return result
}
