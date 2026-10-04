import { fmtDims, fmtLeft } from './inches'
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

export type BlockTier = 'full' | 'medium' | 'small' | 'tiny'

/** How much text a block of this on-screen size (px) can honestly carry. */
export function blockTier(pw: number, ph: number): BlockTier {
  if (pw >= 120 && ph >= 128) return 'full'
  if (pw >= 56 && ph >= 44) return 'medium'
  if (pw >= 20 && ph >= 18) return 'small'
  return 'tiny'
}

/**
 * The tier a block really gets: a block wide enough for text in principle but too narrow for
 * its own size at the smallest readable font drops to 'small' (letter/number only) and is
 * listed under the drawing instead, so text never spills out of its block.
 */
export function blockTierFor(b: Block, pxPerInch: number): BlockTier {
  const pw = b.w * pxPerInch
  const tier = blockTier(pw, b.h * pxPerInch)
  if (tier !== 'full' && tier !== 'medium') return tier
  let text = b.kind === 'cut' ? (b.label ?? fmtDims(b.w, b.h)) : b.kind === 'earlier' ? fmtDims(b.w, b.h) : fmtLeft(b.w, b.h)
  // A short medium block has no room for its chip, so the letter/number joins the size text.
  if (tier === 'medium' && b.h * pxPerInch < CHIP_MIN_H && b.kind !== 'earlier') text = `${b.kind === 'cut' ? `#${b.n ?? ''}` : (b.letter ?? '')} · ${text}`
  const fits = text.length * 0.58 * 9 <= pw - 14
  return fits ? tier : 'small'
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

export interface BlockNote {
  key: string
  text: string
}

/**
 * Blocks too small to carry their own size inside the drawing still owe it to the reader
 * (R15): they are listed under the drawing instead of being left unlabelled.
 */
export function smallBlockNotes(blocks: Block[], pxPerInch: number): BlockNote[] {
  const notes: BlockNote[] = []
  blocks.forEach((b, i) => {
    const tier = blockTierFor(b, pxPerInch)
    if (tier !== 'small' && tier !== 'tiny') return
    if (b.kind === 'cut') {
      notes.push({ key: `n${i}`, text: `Piece ${b.n ?? ''} · ${b.label ?? fmtDims(b.w, b.h)}`.replace('  ', ' ') })
    } else if (b.kind === 'earlier') {
      notes.push({ key: `n${i}`, text: `Already cut · ${fmtDims(b.w, b.h)}` })
    } else if (b.kind === 'free' || b.kind === 'freeNew' || b.kind === 'focus') {
      notes.push({ key: `n${i}`, text: `${b.letter ?? 'Leftover'} · ${fmtLeft(b.w, b.h)}` })
    }
  })
  return notes
}

export interface BadgeInput {
  n: number
  x: number
  y: number
  /** Which way a crowded badge may slide: along the sheet's right edge ('y') or its top edge ('x'). */
  axis: 'x' | 'y'
}

export interface PlacedBadge extends BadgeInput {
  /** Where the cut line really ends; differs from x/y only when the badge had to move. */
  ox: number
  oy: number
}

/**
 * Keeps numbered cut badges from covering each other when several cuts end close together:
 * a badge that would collide slides along its own axis (alternating either side) until it
 * has `minDist` of clear space. The caller draws a short leader back to (ox, oy).
 */
export function placeBadges(items: BadgeInput[], minDist = 26): PlacedBadge[] {
  const placed: PlacedBadge[] = []
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x || a.n - b.n)
  const free = (x: number, y: number) => placed.every((p) => Math.hypot(p.x - x, p.y - y) >= minDist - 0.01)
  for (const it of sorted) {
    let x = it.x
    let y = it.y
    for (let k = 1; !free(x, y) && k < 60; k++) {
      const step = Math.ceil(k / 2) * (minDist * 0.9) * (k % 2 === 1 ? 1 : -1)
      x = it.axis === 'x' ? it.x + step : it.x
      y = it.axis === 'y' ? it.y + step : it.y
    }
    placed.push({ ...it, x, y, ox: it.x, oy: it.y })
  }
  return placed
}

/** `24"` style ruler label; the zero end is written bare. */
export const rulerLabel = (n: number, fmt: (n: number) => string) => (n === 0 ? '0' : `${fmt(n)}"`)
