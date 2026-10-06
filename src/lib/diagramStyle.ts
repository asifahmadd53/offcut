import { fmt, fmtDims, fmtLeft } from './inches'
import type { Block } from './sheetView'

/**
 * Pure helpers for the sheet-diagram look (components/SheetDiagram.tsx). Nothing here
 * recomputes the cutting plan: it only decides how already-computed blocks and cut lines
 * are laid out and labelled.
 */

/**
 * The diagram's own colour tokens, light values. index.css defines them (and their dark
 * values) on :root; surfaces that must always read light — the print page and "Save image"
 * — pin these same values (diagramStyle.test.ts keeps them in step with index.css).
 */
export const DG_LIGHT: Record<string, string> = {
  '--dg-card': '#ffffff',
  '--dg-border': '#e1e6ee',
  '--dg-grid': '#e8ecf3',
  '--dg-text': '#0f172a',
  '--dg-muted': '#64748b',
  '--dg-faint': '#94a3b8',
  '--dg-blue': '#2563eb',
  '--dg-on-blue': '#ffffff',
  '--dg-green': '#047857',
  '--dg-green-fill': '#e4f6ec',
  '--dg-green-hatch': '#b6e5cc',
  '--dg-green-edge': '#5fc795',
  '--dg-orange': '#f59e0b',
  '--dg-on-orange': '#2a1500',
  '--dg-sheet': '#eef1f6',
  '--dg-sheet-edge': '#c3cbd8',
  '--dg-earlier': '#d5dbe5',
}

/** `--dg-x: #fff; …` declarations for a style block. */
export const dgLightDeclarations = () =>
  Object.entries(DG_LIGHT)
    .map(([k, v]) => `${k}: ${v};`)
    .join(' ')

/** Shortest medium block (px) that can hold its chip/number tag above its size text. */
export const CHIP_MIN_H = 58

export type BlockTier = 'full' | 'medium' | 'line' | 'small' | 'tiny'

/** How much text a block of this on-screen size (px) can honestly carry. */
export function blockTier(pw: number, ph: number): BlockTier {
  if (pw >= 120 && ph >= 128) return 'full'
  if (pw >= 56 && ph >= 44) return 'medium'
  if (pw >= 20 && ph >= 18) return 'small'
  return 'tiny'
}

/** A block's size split into the parts a narrow block can stack on separate lines. */
function sizeParts(b: Block): { top: string; w: string; h: string } {
  const split = (text: string, fallbackW: number, fallbackH: number) => {
    const [w, h] = text.split(' × ')
    return { w: w ?? fmt(fallbackW), h: h ?? fmt(fallbackH) }
  }
  if (b.kind === 'cut') return { top: `#${b.n ?? ''}`, ...split(b.label ?? fmtDims(b.w, b.h), b.w, b.h) }
  return { top: '', w: fmt(b.w), h: fmt(b.h) }
}

export interface LineText {
  text: string
  size: number
  /** True when the line is written up the block (reading bottom to top) because it does not fit across. */
  rotated: boolean
}

/**
 * A block too narrow for its size across can still carry it as one line written along it:
 * "#15 · 10 1/2 × 38.6" (piece number, then width × height). Returns the largest type that
 * fits, across or up the block, or null when neither does and the size has to go in a note
 * with a line to the block instead.
 */
export function lineText(b: Block, pw: number, ph: number): LineText | null {
  if (b.kind !== 'cut' && b.kind !== 'earlier') return null
  const { top, w, h } = sizeParts(b)
  const text = top ? `${top} · ${w} × ${h}` : `${w} × ${h}`
  for (const size of [11, 10, 9, 8]) {
    const len = text.length * 0.6 * size
    const thick = size * 1.2
    if (len <= pw - 4 && thick <= ph - 4) return { text, size, rotated: false }
    if (len <= ph - 6 && thick <= pw - 4) return { text, size, rotated: true }
  }
  return null
}

/**
 * The tier a block really gets: a block wide enough for text in principle but too narrow for
 * its own size at the smallest readable font first tries one line along the block (across or
 * up it), and only then drops to 'small' (number only) with its size in a note beside the sheet.
 */
export function blockTierFor(b: Block, pxPerInch: number): BlockTier {
  const pw = b.w * pxPerInch
  const ph = b.h * pxPerInch
  const tier = blockTier(pw, ph)
  if (tier === 'full' || tier === 'medium') {
    let text = b.kind === 'cut' ? (b.label ?? fmtDims(b.w, b.h)) : b.kind === 'earlier' ? fmtDims(b.w, b.h) : fmtLeft(b.w, b.h)
    // A short medium block has no room for its chip, so the letter/number joins the size text.
    if (tier === 'medium' && ph < CHIP_MIN_H && b.kind !== 'earlier') text = `${b.kind === 'cut' ? `#${b.n ?? ''}` : (b.letter ?? '')} · ${text}`
    if (text.length * 0.58 * 9 <= pw - 14) return tier
  }
  if (lineText(b, pw, ph)) return 'line'
  return tier === 'full' || tier === 'medium' ? 'small' : tier
}

export interface YTick {
  /** Inches measured up from the bottom of the sheet (0 at the bottom, sheetH at the top). */
  value: number
  /** Pixels down from the top of the sheet. */
  y: number
  /** True for the top/bottom ends, false for an interior block edge. */
  end: boolean
}

const EPS = 1e-6

/**
 * Left-ruler ticks at the real horizontal edges of the blocks, numbered from the bottom
 * (bottom is 0, top is the sheet height). The two ends always stay; an interior edge is
 * dropped when it would sit closer than `minGapPx` to a kept tick.
 */
export function verticalTicks(
  blocks: Pick<Block, 'y' | 'h'>[],
  sheetH: number,
  pxPerInch: number,
  minGapPx = 18,
): YTick[] {
  const edges = new Set<number>([0, sheetH])
  for (const b of blocks) {
    edges.add(Math.round(b.y * 1000) / 1000)
    edges.add(Math.round((b.y + b.h) * 1000) / 1000)
  }
  const sorted = [...edges].filter((y) => y >= -EPS && y <= sheetH + EPS).sort((a, b) => a - b)

  const out: YTick[] = []
  let lastPx = -Infinity
  for (const y of sorted) {
    const px = y * pxPerInch
    const isTop = Math.abs(y) < EPS
    if (Math.abs(y - sheetH) < EPS) {
      out.push({ value: 0, y: px, end: true })
      continue
    }
    if (!isTop && (px - lastPx < minGapPx || (sheetH - y) * pxPerInch < minGapPx)) continue
    out.push({ value: sheetH - y, y: px, end: isTop })
    lastPx = px
  }
  return out
}

export interface XTick {
  value: number
  major: boolean
}

/** Bottom-ruler ticks: majors at 0, half and full width, minors at the quarters. */
export function horizontalTicks(sheetW: number): XTick[] {
  return [0, 0.25, 0.5, 0.75, 1].map((f) => ({ value: sheetW * f, major: f === 0 || f === 0.5 || f === 1 }))
}

export interface SmallCallout {
  key: string
  /** "Piece 6", "A" or "Already cut". */
  name: string
  /** The size, written the way the block itself would show it. */
  dims: string
  /** Where the block's right edge meets its middle, in sheet inches: the end of the leader line. */
  ax: number
  ay: number
}

/**
 * Blocks too small to carry their own size inside the drawing still owe it to the reader
 * (R15): each gets a note beside the sheet with a line pointing at the block, however tiny
 * the block is.
 */
export function smallBlockCallouts(blocks: Block[], pxPerInch: number): SmallCallout[] {
  const out: SmallCallout[] = []
  blocks.forEach((b, i) => {
    const at = { ax: b.x + b.w, ay: b.y + b.h / 2 }
    // A leftover shows only its letter (its size is in the "Saved to stock" list); it gets a
    // note with a line only when even the letter does not fit.
    if (b.kind === 'free' || b.kind === 'freeNew' || b.kind === 'focus') {
      if (b.w * pxPerInch < 12 || b.h * pxPerInch < 14) out.push({ key: `n${i}`, name: b.letter ?? 'Leftover', dims: '', ...at })
      return
    }
    const tier = blockTierFor(b, pxPerInch)
    if (tier !== 'small' && tier !== 'tiny') return
    if (b.kind === 'cut') {
      out.push({ key: `n${i}`, name: `Piece ${b.n ?? ''}`.trim(), dims: b.label ?? fmtDims(b.w, b.h), ...at })
    } else if (b.kind === 'earlier') {
      out.push({ key: `n${i}`, name: 'Already cut', dims: fmtDims(b.w, b.h), ...at })
    }
  })
  return out
}

/**
 * Spreads desired positions (ascending) so neighbours are at least `minGap` apart, pulling
 * the group back up when it would run past `hi`. Returns as many positions as fit between
 * `lo` and `hi`; the caller draws only those, so nothing is ever drawn on top of another.
 */
export function spreadPositions(desired: number[], minGap: number, lo: number, hi: number): number[] {
  const cap = Math.max(0, Math.floor((hi - lo) / minGap) + 1)
  const ys = desired.slice(0, cap).map((d) => Math.min(Math.max(d, lo), hi))
  for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + minGap)
  for (let i = ys.length - 1; i >= 0; i--) {
    const limit = i === ys.length - 1 ? hi : ys[i + 1] - minGap
    ys[i] = Math.min(ys[i], limit)
  }
  return ys
}

/** `24"` style ruler label; the zero end is written bare. */
export const rulerLabel = (n: number, fmt: (n: number) => string) => (n === 0 ? '0' : `${fmt(n)}"`)
