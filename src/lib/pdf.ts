import { computeWasteCells, edgesToSegments, extractEdges } from './diagramLayout'
import { plural } from './format'
import { fmt, fmtLeft } from './inches'
import type { jsPDF as JsPdfDoc, jsPDFOptions } from 'jspdf'
import type { PrintPage } from './print'
import type { Block } from './sheetView'
import type { CutDoc, Settings, SheetPlan } from './types'

/**
 * Turns a job's client/sheet reference (or its pieces/date, when either is missing) into
 * a file name — "Asif 34 by 56.pdf" when a client and sheet number were typed on New job,
 * "Asif.pdf" when only the client was, else (no client at all) falling
 * back to "Offcut - 23x77 2pcs - 2026-09-21". A "/" or "-" inside the sheet number is
 * written as the word "by" ("34/56" -> "34 by 56"): "/" is a path separator, and the user
 * wants neither character in the saved name. Pure and DOM-free so it can be unit-tested
 * without touching jsPDF or the browser at all.
 */
export function pdfFileName(cut: CutDoc): string {
  const clientName = cut.clientName?.trim()
  const sheetNumber = cut.sheetNumber?.trim().replace(/\s*[/-]\s*/g, ' by ')
  const raw =
    clientName
      ? sheetNumber
        ? `${clientName} ${sheetNumber}`
        : clientName
      : (() => {
          const first = cut.pieces?.[0]
          const pieceText = first ? `${fmt(first.w)}x${fmt(first.h)} ${first.qty}pcs` : 'sheet'
          const date = new Date(cut.createdAt)
          const dateText = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
          return `Offcut - ${pieceText} - ${dateText}`
        })()
  // Strip characters most filesystems reject; collapse the whitespace that leaves behind.
  return raw.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim() + '.pdf'
}


// ---------------------------------------------------------------------------
// Page layout. The PDF is what the carpenter hands to a client, so everything a
// reader needs sits on the sheet's own page in plain words: who it is for, how
// much of the sheet is used, the drawing, the numbered cut order and every part.
// Only vector rect/line/text calls in Helvetica (offline, no embedded fonts).
// ---------------------------------------------------------------------------

const PAGE_MM: Record<'A4' | 'Letter', { w: number; h: number }> = {
  A4: { w: 210, h: 297 },
  Letter: { w: 215.9, h: 279.4 },
}

const MARGIN = 11
const FOOTER_H = 8
const INFO_W = 56
const COL_GAP = 4
const PT = 0.3528 // mm per point

type RGB = [number, number, number]

const COL = {
  ink: [27, 26, 23] as RGB,
  muted: [95, 90, 80] as RGB,
  faint: [165, 158, 145] as RGB,
  rule: [214, 209, 199] as RGB,
  white: [255, 255, 255] as RGB,
  brand: [194, 65, 12] as RGB,
  blue: [37, 99, 235] as RGB,
  blueFill: [219, 234, 254] as RGB,
  blueInk: [23, 52, 140] as RGB,
  green: [34, 139, 87] as RGB,
  greenFill: [226, 246, 235] as RGB,
  greenInk: [14, 92, 56] as RGB,
  earlierFill: [233, 229, 221] as RGB,
  earlierEdge: [140, 132, 115] as RGB,
  earlierInk: [90, 84, 72] as RGB,
  wasteFill: [246, 243, 238] as RGB,
  wasteInk: [125, 119, 107] as RGB,
  cut: [234, 110, 0] as RGB,
  sheetEdge: [50, 48, 44] as RGB,
}

interface TextStyle {
  size: number
  bold?: boolean
  color?: RGB
  align?: 'left' | 'center' | 'right'
  angle?: number
}

/** Every text in the file goes through here, one line per call, so nothing wraps on its own. */
function put(doc: JsPdfDoc, text: string, x: number, y: number, st: TextStyle) {
  doc.setFont('helvetica', st.bold ? 'bold' : 'normal')
  doc.setFontSize(st.size)
  doc.setTextColor(...(st.color ?? COL.ink))
  const opts: { align: 'left' | 'center' | 'right'; angle?: number } = { align: st.align ?? 'left' }
  if (st.angle) opts.angle = st.angle
  doc.text(text, x, y, opts)
}

function widthOf(doc: JsPdfDoc, text: string, size: number, bold = false): number {
  doc.setFont('helvetica', bold ? 'bold' : 'normal')
  doc.setFontSize(size)
  return doc.getTextWidth(text)
}

function wrap(doc: JsPdfDoc, text: string, maxW: number, size: number, bold = false): string[] {
  doc.setFont('helvetica', bold ? 'bold' : 'normal')
  doc.setFontSize(size)
  const r = doc.splitTextToSize(text, maxW)
  return Array.isArray(r) ? r : [String(r)]
}

function ellipsize(doc: JsPdfDoc, text: string, maxW: number, size: number, bold = false): string {
  if (widthOf(doc, text, size, bold) <= maxW) return text
  let cur = text
  while (cur.length > 1 && widthOf(doc, cur + '…', size, bold) > maxW) cur = cur.slice(0, -1)
  return cur + '…'
}

const lineHeight = (size: number) => size * PT * 1.25

// ---------- Pure numbers ----------

export interface SheetStats {
  regionArea: number
  used: number
  saved: number
  waste: number
  usedPct: number
  savedPct: number
  wastePct: number
  pieces: number
  leftovers: number
}

/**
 * How the working area of one sheet (the whole sheet, or the leftover being cut) splits into
 * pieces, leftovers kept and waste. Waste is whatever remains, so the three whole-number
 * areas and the three percentages always add up exactly to the area and to 100.
 * `usedPct` is the same rounding the Plan screen shows.
 */
export function sheetStats(sheet: SheetPlan): SheetStats {
  const regionRaw = sheet.region.w * sheet.region.h
  const usedRaw = sheet.placements.reduce((t, p) => t + p.w * p.h, 0)
  const savedRaw = sheet.newLeftovers.reduce((t, l) => t + l.w * l.h, 0)
  const regionArea = Math.round(regionRaw)
  const used = Math.min(Math.round(usedRaw), regionArea)
  const saved = Math.min(Math.round(savedRaw), regionArea - used)
  const usedPct = regionRaw > 0 ? Math.round((usedRaw / regionRaw) * 100) : 0
  const savedPct = regionRaw > 0 ? Math.min(Math.round((savedRaw / regionRaw) * 100), 100 - usedPct) : 0
  return {
    regionArea,
    used,
    saved,
    waste: regionArea - used - saved,
    usedPct,
    savedPct,
    wastePct: Math.max(0, 100 - usedPct - savedPct),
    pieces: sheet.placements.length,
    leftovers: sheet.newLeftovers.length,
  }
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

interface TableRow {
  name: string
  size: string
  what: string
}

/**
 * Every piece, leftover and already-cut block on the sheet, in plain words and reading order:
 * pieces (by number), then leftovers, then what was cut earlier. Leftovers show their short
 * side first, exactly like the drawing; pieces keep the size as typed.
 */
export function tableRows(blocks: Block[]): TableRow[] {
  const pieces: TableRow[] = blocks
    .filter((b) => b.kind === 'cut')
    .map((b) => ({
      name: `Piece ${b.n ?? ''}`,
      size: b.label ?? `${fmt(b.w)} × ${fmt(b.h)}`,
      what: b.rotated ? 'Piece (turned)' : 'Piece',
    }))
  const leftovers: TableRow[] = blocks
    .filter((b) => b.kind === 'free' || b.kind === 'freeNew' || b.kind === 'focus')
    .map((b) => ({
      name: b.letter ?? 'Leftover',
      size: fmtLeft(b.w, b.h),
      what: b.kind === 'freeNew' ? 'New leftover' : 'In stock',
    }))
  const earlier: TableRow[] = blocks
    .filter((b) => b.kind === 'earlier')
    .map((b) => ({ name: 'Already cut', size: `${fmt(b.w)} × ${fmt(b.h)}`, what: 'Done earlier' }))
  return [...pieces, ...leftovers, ...earlier]
}

// ---------- Job-wide facts repeated on every page ----------

interface JobFacts {
  client?: string
  phone?: string
  ref?: string
  sheetCount: number
  newSheets: number
  pieceCount: number
  overallPct: number
}

function jobFacts(pages: PrintPage[], cut?: CutDoc): JobFacts {
  const regionTotal = pages.reduce((t, p) => t + p.sheet.region.w * p.sheet.region.h, 0)
  const usedTotal = pages.reduce((t, p) => t + p.sheet.placements.reduce((a, q) => a + q.w * q.h, 0), 0)
  return {
    client: cut?.clientName?.trim() || undefined,
    phone: cut?.clientPhone?.trim() || undefined,
    ref: cut?.sheetNumber?.trim() || undefined,
    sheetCount: pages.length,
    newSheets: pages.filter((p) => p.sheet.isNew).length,
    pieceCount: pages.reduce((t, p) => t + p.sheet.placements.length, 0),
    overallPct: regionTotal > 0 ? Math.round((usedTotal / regionTotal) * 100) : 0,
  }
}

function sheetsPhrase(job: JobFacts): string {
  if (job.newSheets === job.sheetCount) return plural(job.sheetCount, 'new sheet')
  if (job.newSheets === 0) return `${plural(job.sheetCount, 'cut')} from saved leftovers`
  return `${plural(job.sheetCount, 'sheet')} (${job.newSheets} new)`
}

// ---------- Header and footer ----------

function drawHeader(doc: JsPdfDoc, page: PrintPage, job: JobFacts, pageW: number, continued: boolean): number {
  const innerW = pageW - MARGIN * 2
  let y = MARGIN + 3
  put(doc, 'OFFCUT  ·  Cutting plan', MARGIN, y, { size: 9, bold: true, color: COL.brand })
  put(doc, `Sheet ${page.sheetIndex + 1} of ${page.sheetTotal}${continued ? ' (continued)' : ''}`, pageW - MARGIN, y + 1, {
    size: 15,
    bold: true,
    align: 'right',
  })
  y += 9
  const title = ellipsize(doc, job.client ?? page.jobTitle, innerW, 17, true)
  put(doc, title, MARGIN, y, { size: 17, bold: true })
  y += 6
  const details = [
    job.phone ? `Phone ${job.phone}` : '',
    job.ref ? `Sheet no. ${job.ref}` : '',
    page.dateTimeText,
  ].filter(Boolean)
  for (const line of wrap(doc, details.join('  ·  '), innerW, 9.5)) {
    put(doc, line, MARGIN, y, { size: 9.5, color: COL.muted })
    y += lineHeight(9.5)
  }
  const jobLine = [
    job.client ? `Job: ${page.jobTitle}` : '',
    sheetsPhrase(job),
    plural(job.pieceCount, 'piece'),
    `${job.overallPct}% of the material used`,
  ]
    .filter(Boolean)
    .join('  ·  ')
  for (const line of wrap(doc, jobLine, innerW, 9.5)) {
    put(doc, line, MARGIN, y, { size: 9.5, color: COL.muted })
    y += lineHeight(9.5)
  }
  y += 0.5
  doc.setDrawColor(...COL.rule)
  doc.setLineWidth(0.3)
  doc.line(MARGIN, y, pageW - MARGIN, y)
  return y + 4
}

function drawFooter(doc: JsPdfDoc, page: PrintPage, pageH: number) {
  put(doc, page.footerLeft, MARGIN, pageH - MARGIN + 2, { size: 8, color: COL.muted })
}

// ---------- The drawing ----------

interface Box {
  x: number
  y: number
  w: number
  h: number
}

interface LabelBox {
  x0: number
  x1: number
  y0: number
  y1: number
}

const hits = (a: LabelBox, b: LabelBox) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1

/** Text lines a block can carry, richest first; the last entry is the bare letter/number. */
function labelCandidates(b: Block): string[][] {
  const plain = `${fmt(b.w)} × ${fmt(b.h)}`
  if (b.kind === 'cut') {
    const d = b.label ?? plain
    const n = `${b.n ?? ''}`
    const full = [`Piece ${n}`, d]
    return [b.rotated ? [...full, 'turned to fit'] : full, full, [`${n}  ${d}`], [n]]
  }
  if (b.kind === 'free' || b.kind === 'freeNew' || b.kind === 'focus') {
    const d = fmtLeft(b.w, b.h)
    const name = b.letter ?? ''
    const full = [`Leftover ${name}`, d]
    return [[...full, b.kind === 'freeNew' ? 'saved to stock' : 'already in stock'], full, [`${name}  ${d}`], [name]]
  }
  if (b.kind === 'earlier') return [['Already cut', plain], [plain]]
  return [['Waste']]
}

function inkFor(b: Block): RGB {
  if (b.kind === 'cut') return COL.blueInk
  if (b.kind === 'earlier') return COL.earlierInk
  if (b.kind === 'waste') return COL.wasteInk
  return COL.greenInk
}

function fitBlockLabel(
  doc: JsPdfDoc,
  b: Block,
  pw: number,
  ph: number,
  cx: number,
  cy: number,
  avoid: LabelBox[],
): { lines: string[]; size: number } | null {
  const pad = 1.2
  const cands = labelCandidates(b)
  for (let ci = 0; ci < cands.length; ci++) {
    const lines = cands[ci]
    const tagOnly = ci === cands.length - 1 && cands.length > 1
    for (let size = 10; size >= (tagOnly ? 7 : 7.5); size -= 0.5) {
      const lh = lineHeight(size)
      const totalH = lines.length * lh
      const maxW = Math.max(...lines.map((l, i) => widthOf(doc, l, size, i === 0)))
      if (maxW > pw - pad * 2 || totalH > ph - pad * 2) continue
      const box = { x0: cx - maxW / 2, x1: cx + maxW / 2, y0: cy - totalH / 2, y1: cy + totalH / 2 }
      if (avoid.some((a) => hits(a, box))) continue
      return { lines, size }
    }
  }
  return null
}

function drawLegend(doc: JsPdfDoc, sheet: SheetPlan, blocks: Block[], x: number, y: number, maxW: number) {
  const items: Array<{ key: 'blue' | 'green' | 'earlier' | 'cut'; text: string }> = [
    { key: 'blue', text: 'Piece to cut' },
    { key: 'green', text: 'Leftover' },
  ]
  if (blocks.some((b) => b.kind === 'earlier')) items.push({ key: 'earlier', text: 'Already cut' })
  if ((sheet.cuts ?? []).length > 0) items.push({ key: 'cut', text: 'Cut order' })
  const size = 8.5
  const itemW = (t: string) => 5.5 + widthOf(doc, t, size)
  let cx = x
  let cy = y
  for (const it of items) {
    if (cx > x && cx + itemW(it.text) > x + maxW) {
      cx = x
      cy += 5.5
    }
    if (it.key === 'cut') {
      doc.setFillColor(...COL.cut)
      doc.circle(cx + 1.8, cy - 1, 1.8, 'F')
    } else {
      const fill = it.key === 'blue' ? COL.blueFill : it.key === 'green' ? COL.greenFill : COL.earlierFill
      const edge = it.key === 'blue' ? COL.blue : it.key === 'green' ? COL.green : COL.earlierEdge
      doc.setFillColor(...fill)
      doc.setDrawColor(...edge)
      doc.setLineWidth(0.25)
      if (it.key === 'green') doc.setLineDashPattern([0.7, 0.5], 0)
      doc.rect(cx, cy - 2.8, 3.6, 3.6, 'FD')
      doc.setLineDashPattern([], 0)
    }
    put(doc, it.text, cx + 5.5, cy, { size, color: COL.muted })
    cx += itemW(it.text) + 5
  }
}

interface BlockFit {
  block: Block
  fit: { lines: string[]; size: number } | null
}

interface DiagramPlan {
  sc: number
  X0: number
  Y0: number
  X1: number
  Y1: number
  badges: BadgePlace[]
  fits: BlockFit[]
  wasteFits: Array<{ cell: { x: number; y: number; w: number; h: number }; fit: { lines: string[]; size: number } }>
  callouts: Array<{ name: string; dims: string; ax: number; ay: number; ink: RGB }>
}

const BADGE_R = 2.6

export interface BadgePlace {
  n: number
  x: number
  y: number
  /** Where the cut line really starts or ends; the number sits here unless it had to move. */
  ox: number
  oy: number
}

interface BadgeGeometry {
  X0: number
  X1: number
  Y0: number
  Y1: number
  /** Sheet inches to mm. */
  X: (inches: number) => number
  Y: (inches: number) => number
  sheetW: number
}

/**
 * Puts each cut's number as close to its line's end as it can without touching another
 * number, and keeps every number in an allowed strip (above the sheet, beside it on the
 * right, or inside it) so none runs over the dimensions or the notes in the margin.
 */
export function placeCutBadges(cuts: NonNullable<SheetPlan['cuts']>, g: BadgeGeometry, minDist = 5.7): BadgePlace[] {
  const R = BADGE_R + 0.4
  type Zone = { x0: number; x1: number; y0: number; y1: number }
  const top: Zone = { x0: g.X0 - 1, x1: g.X1 + 7.2, y0: g.Y0 - 7.4, y1: g.Y0 - 1.2 }
  const right: Zone = { x0: g.X1 + 1.5, x1: g.X1 + 7.2, y0: g.Y0 - 7.4, y1: g.Y1 + 7 }
  const inside: Zone = { x0: g.X0 + R, x1: g.X1 - R, y0: g.Y0 + R, y1: g.Y1 - R }
  const placed: BadgePlace[] = []
  for (const c of cuts) {
    let ox: number
    let oy: number
    let zone: Zone
    if (c.kind === 'across') {
      const atEdge = c.to >= g.sheetW - 1e-6
      ox = atEdge ? g.X1 + 3.8 : g.X(c.to) - R
      oy = g.Y(c.pos)
      zone = atEdge ? right : inside
    } else {
      const atTop = c.from <= 1e-6
      ox = g.X(c.pos)
      oy = atTop ? g.Y0 - 3.8 : g.Y(c.from) + R
      zone = atTop ? top : inside
    }
    const free = (x: number, y: number) => placed.every((p) => Math.hypot(p.x - x, p.y - y) >= minDist)
    const ok = (x: number, y: number) => x >= zone.x0 && x <= zone.x1 && y >= zone.y0 && y <= zone.y1 && free(x, y)
    let best: { x: number; y: number } | null = ok(ox, oy) ? { x: ox, y: oy } : null
    for (let ring = 1; !best && ring <= 40; ring++) {
      const r = ring * 1.4
      let bestD = Infinity
      for (let a = 0; a < 32; a++) {
        const x = ox + r * Math.cos((a / 32) * Math.PI * 2)
        const y = oy + r * Math.sin((a / 32) * Math.PI * 2)
        const d = Math.hypot(x - ox, y - oy)
        if (ok(x, y) && d < bestD) {
          best = { x, y }
          bestD = d
        }
      }
    }
    placed.push({ n: c.n, x: best?.x ?? ox, y: best?.y ?? oy, ox, oy })
  }
  return placed
}

/** Works out scale, cut numbers and every label for one margin width — nothing is drawn yet. */
function planDiagram(doc: JsPdfDoc, page: PrintPage, box: Box, zoneRight: number, wasteCells: ReturnType<typeof computeWasteCells>): DiagramPlan {
  const { sheet, blocks } = page
  const zone = { top: 20, left: 21, bottom: 16 }
  const availW = box.w - zone.left - zoneRight
  const availH = box.h - zone.top - zone.bottom
  const sc = Math.min(availW / sheet.sheetW, availH / sheet.sheetH)
  const X0 = box.x + zone.left + (availW - sheet.sheetW * sc) / 2
  const Y0 = box.y + zone.top
  const X1 = X0 + sheet.sheetW * sc
  const Y1 = Y0 + sheet.sheetH * sc
  const X = (inX: number) => X0 + inX * sc
  const Y = (inY: number) => Y0 + inY * sc

  const cuts = sheet.cuts ?? []
  const badges = placeCutBadges(cuts, { X0, X1, Y0, Y1, X, Y, sheetW: sheet.sheetW })
  const avoid: LabelBox[] = badges.map((b) => ({ x0: b.x - BADGE_R - 0.6, x1: b.x + BADGE_R + 0.6, y0: b.y - BADGE_R - 0.6, y1: b.y + BADGE_R + 0.6 }))

  const fits: BlockFit[] = []
  const callouts: DiagramPlan['callouts'] = []
  for (const b of blocks) {
    const pw = b.w * sc
    const ph = b.h * sc
    const fit = fitBlockLabel(doc, b, pw, ph, X(b.x) + pw / 2, Y(b.y) + ph / 2, avoid)
    fits.push({ block: b, fit })
    if (!fit && b.kind !== 'waste') {
      const name = b.kind === 'cut' ? `Piece ${b.n ?? ''}` : b.kind === 'earlier' ? 'Already cut' : `Leftover ${b.letter ?? ''}`
      const dims = b.kind === 'cut' ? (b.label ?? `${fmt(b.w)} × ${fmt(b.h)}`) : b.kind === 'earlier' ? `${fmt(b.w)} × ${fmt(b.h)}` : fmtLeft(b.w, b.h)
      callouts.push({ name, dims, ax: X(b.x + b.w), ay: Y(b.y + b.h / 2), ink: inkFor(b) })
    }
  }
  // Waste regions inside the cut area say so when they have room.
  const wasteFits: DiagramPlan['wasteFits'] = []
  const r = sheet.region
  for (const c of wasteCells) {
    const inside = c.x >= r.x - 1e-6 && c.y >= r.y - 1e-6 && c.x + c.w <= r.x + r.w + 1e-6 && c.y + c.h <= r.y + r.h + 1e-6
    if (!inside) continue
    const pw = c.w * sc
    const ph = c.h * sc
    const fit = fitBlockLabel(doc, { kind: 'waste', x: c.x, y: c.y, w: c.w, h: c.h }, pw, ph, X(c.x) + pw / 2, Y(c.y) + ph / 2, avoid)
    if (fit) wasteFits.push({ cell: c, fit })
  }
  return { sc, X0, Y0, X1, Y1, badges, fits, wasteFits, callouts }
}

function drawDiagram(doc: JsPdfDoc, page: PrintPage, box: Box) {
  const { sheet, blocks } = page
  const sheetW = sheet.sheetW
  const sheetH = sheet.sheetH
  const wasteCells = computeWasteCells(blocks, { x: 0, y: 0, w: sheetW, h: sheetH })

  // Blocks too small for any text get a two-line note in the right margin; give that margin
  // room only when some block needs it, so an ordinary sheet is drawn as large as possible.
  let plan = planDiagram(doc, page, box, 15, wasteCells)
  if (plan.callouts.length > 0) plan = planDiagram(doc, page, box, 36, wasteCells)
  const { sc, X0, Y0, X1, Y1, badges, fits, wasteFits, callouts } = plan
  const X = (inX: number) => X0 + inX * sc
  const Y = (inY: number) => Y0 + inY * sc
  const sw = sheetW * sc
  const sh = sheetH * sc

  // Sheet background and waste.
  doc.setFillColor(...COL.white)
  doc.rect(X0, Y0, sw, sh, 'F')
  for (const c of wasteCells) {
    doc.setFillColor(...COL.wasteFill)
    doc.rect(X(c.x), Y(c.y), c.w * sc, c.h * sc, 'F')
  }

  // Blocks: already cut, then leftovers, then pieces — same stacking as the screen.
  const isFree = (b: Block) => b.kind === 'free' || b.kind === 'freeNew' || b.kind === 'focus'
  doc.setLineWidth(0.25)
  for (const b of blocks.filter((x) => x.kind === 'earlier')) {
    doc.setFillColor(...COL.earlierFill)
    doc.setDrawColor(...COL.earlierEdge)
    doc.rect(X(b.x), Y(b.y), b.w * sc, b.h * sc, 'FD')
  }
  for (const b of blocks.filter(isFree)) {
    doc.setFillColor(...COL.greenFill)
    doc.setDrawColor(...COL.green)
    doc.setLineDashPattern([1.1, 0.8], 0)
    doc.rect(X(b.x), Y(b.y), b.w * sc, b.h * sc, 'FD')
    doc.setLineDashPattern([], 0)
  }
  for (const b of blocks.filter((x) => x.kind === 'cut')) {
    doc.setFillColor(...COL.blueFill)
    doc.setDrawColor(...COL.blue)
    doc.setLineWidth(0.35)
    doc.rect(X(b.x), Y(b.y), b.w * sc, b.h * sc, 'FD')
  }

  // Cut lines and their numbers (the same numbers as the Cut order list).
  const cuts = sheet.cuts ?? []
  doc.setDrawColor(...COL.cut)
  doc.setLineWidth(0.45)
  doc.setLineDashPattern([1.6, 1.1], 0)
  for (const c of cuts) {
    if (c.kind === 'across') doc.line(X(c.from), Y(c.pos), X(c.to), Y(c.pos))
    else doc.line(X(c.pos), Y(c.from), X(c.pos), Y(c.to))
  }
  doc.setLineDashPattern([], 0)

  doc.setDrawColor(...COL.sheetEdge)
  doc.setLineWidth(0.5)
  doc.rect(X0, Y0, sw, sh, 'S')

  // Text inside blocks.
  for (const { block: b, fit } of fits) {
    if (!fit) continue
    const cx = X(b.x) + (b.w * sc) / 2
    const cy = Y(b.y) + (b.h * sc) / 2
    const lh = lineHeight(fit.size)
    const top = cy - (fit.lines.length * lh) / 2
    fit.lines.forEach((line, i) => {
      put(doc, line, cx, top + i * lh + fit.size * PT * 0.95, { size: fit.size, bold: i === 0, color: inkFor(b), align: 'center' })
    })
  }
  for (const { cell, fit } of wasteFits) {
    put(doc, 'Waste', X(cell.x) + (cell.w * sc) / 2, Y(cell.y) + (cell.h * sc) / 2 + fit.size * PT * 0.35, { size: fit.size, color: COL.wasteInk, align: 'center' })
  }

  // Callouts: top to bottom, never closer than their own two lines.
  const ordered = [...callouts].sort((a, b) => a.ay - b.ay)
  const gutterX = X1 + 10
  const gutterW = box.x + box.w - gutterX
  const ys = spreadPositions(ordered.map((c) => c.ay), 8.4, Y0 + 3, Y1 + 3)
  ys.forEach((yy, i) => {
    const c = ordered[i]
    doc.setDrawColor(...COL.faint)
    doc.setLineWidth(0.2)
    doc.setLineDashPattern([0.4, 0.5], 0)
    doc.line(c.ax, c.ay, gutterX - 1, yy - 1)
    doc.setLineDashPattern([], 0)
    put(doc, ellipsize(doc, c.name, gutterW, 8, true), gutterX, yy, { size: 8, bold: true, color: c.ink })
    put(doc, ellipsize(doc, c.dims, gutterW, 8), gutterX, yy + 3.6, { size: 8, color: c.ink })
  })

  // Cut numbers on top.
  for (const b of badges) {
    if (Math.abs(b.x - b.ox) > 0.1 || Math.abs(b.y - b.oy) > 0.1) {
      doc.setDrawColor(...COL.cut)
      doc.setLineWidth(0.25)
      doc.line(b.ox, b.oy, b.x, b.y)
    }
    doc.setFillColor(...COL.cut)
    doc.circle(b.x, b.y, BADGE_R, 'F')
    put(doc, `${b.n}`, b.x, b.y + 7.5 * PT * 0.35, { size: 7.5, bold: true, color: COL.white, align: 'center' })
  }

  // Overall size: a dimension line above (width) and beside (height) the sheet.
  doc.setDrawColor(...COL.muted)
  doc.setLineWidth(0.25)
  const dimY = Y0 - 14.5
  doc.line(X0, dimY, X1, dimY)
  doc.line(X0, dimY - 1.4, X0, dimY + 1.4)
  doc.line(X1, dimY - 1.4, X1, dimY + 1.4)
  put(doc, `${fmt(sheetW)} in wide`, (X0 + X1) / 2, dimY - 1.8, { size: 9.5, bold: true, align: 'center' })
  const dimX = X0 - 14.5
  doc.line(dimX, Y0, dimX, Y1)
  doc.line(dimX - 1.4, Y0, dimX + 1.4, Y0)
  doc.line(dimX - 1.4, Y1, dimX + 1.4, Y1)
  const hText = `${fmt(sheetH)} in tall`
  const hW = widthOf(doc, hText, 9.5, true)
  put(doc, hText, dimX - 1.8, (Y0 + Y1) / 2 + hW / 2, { size: 9.5, bold: true, angle: 90 })

  // Section sizes between the edges, skipping any that would touch their neighbour.
  const dimBlocks = blocks.filter((b) => b.kind === 'cut' || isFree(b))
  let lastRight = -Infinity
  for (const s of edgesToSegments(extractEdges(dimBlocks, 'x', 0, sheetW))) {
    const mid = X((s.from + s.to) / 2)
    const w = widthOf(doc, s.label, 8)
    if (mid - w / 2 < lastRight + 1) continue
    put(doc, s.label, mid, Y0 - 8.2, { size: 8, color: COL.muted, align: 'center' })
    lastRight = mid + w / 2
  }
  let lastY = -Infinity
  for (const s of edgesToSegments(extractEdges(dimBlocks, 'y', 0, sheetH))) {
    const mid = Y((s.from + s.to) / 2)
    if (mid - lastY < 3.6) continue
    put(doc, s.label, X0 - 2.2, mid + 8 * PT * 0.35, { size: 8, color: COL.muted, align: 'right' })
    lastY = mid
  }

  drawLegend(doc, sheet, blocks, box.x, Y1 + 9, box.w)
}

// ---------- Information column ----------

function heading(doc: JsPdfDoc, text: string, x: number, y: number, w: number): number {
  put(doc, text.toUpperCase(), x, y, { size: 8, bold: true, color: COL.muted })
  doc.setDrawColor(...COL.rule)
  doc.setLineWidth(0.25)
  doc.line(x, y + 1.3, x + w, y + 1.3)
  return y + 5.5
}

function drawStats(doc: JsPdfDoc, stats: SheetStats, isNew: boolean, x: number, y: number, w: number, compact = false): number {
  y = heading(doc, 'How much is used', x, y, w)
  put(doc, `${stats.usedPct}%`, x, y + 5, { size: 24, bold: true })
  put(doc, isNew ? 'of this sheet is used' : 'of this leftover is used', x + widthOf(doc, `${stats.usedPct}%`, 24, true) + 2, y + 5, { size: 9, color: COL.muted })
  y += 8
  // One bar split into pieces / leftovers kept / waste.
  doc.setDrawColor(...COL.rule)
  doc.setFillColor(...COL.wasteFill)
  doc.setLineWidth(0.25)
  doc.rect(x, y, w, 3.4, 'FD')
  const usedW = (w * stats.usedPct) / 100
  const savedW = (w * stats.savedPct) / 100
  if (usedW > 0) {
    doc.setFillColor(...COL.blue)
    doc.rect(x, y, usedW, 3.4, 'F')
  }
  if (savedW > 0) {
    doc.setFillColor(...COL.green)
    doc.rect(x + usedW, y, savedW, 3.4, 'F')
  }
  y += 7
  const sq = (n: number) => `${n.toLocaleString('en-US')} sq in`
  const row = (swatch: RGB, label: string, pct: number, detail: string) => {
    doc.setFillColor(...swatch)
    doc.rect(x, y - 2.4, 2.6, 2.6, 'F')
    if (compact) {
      put(doc, label, x + 4, y, { size: 8.5, bold: true })
      put(doc, `${detail} · ${pct}%`, x + w, y, { size: 8.5, align: 'right' })
      y += lineHeight(8.5) + 0.6
      return
    }
    put(doc, label, x + 4, y, { size: 9, bold: true })
    put(doc, `${pct}%`, x + w, y, { size: 9, bold: true, align: 'right' })
    y += lineHeight(9)
    put(doc, detail, x + 4, y, { size: 8, color: COL.muted })
    y += lineHeight(8) + 1.2
  }
  row(COL.blue, 'Pieces cut', stats.usedPct, compact ? sq(stats.used) : `${sq(stats.used)} · ${plural(stats.pieces, 'piece')}`)
  row(COL.green, 'Leftovers kept', stats.savedPct, compact ? sq(stats.saved) : `${sq(stats.saved)} · ${plural(stats.leftovers, 'leftover')}`)
  row(COL.faint, 'Waste', stats.wastePct, compact ? sq(stats.waste) : `${sq(stats.waste)} · saw cuts and scraps`)
  put(doc, `${isNew ? 'Whole sheet' : 'Leftover area'}: ${sq(stats.regionArea)}`, x, y, { size: 8, color: COL.muted })
  return y + 5
}

/** Draws steps until `maxY`; returns the steps that did not fit. */
function drawSteps(doc: JsPdfDoc, steps: string[], startNo: number, x: number, y: number, w: number, maxY: number, size = 9, gap = 1.4): { y: number; rest: number } {
  const textX = x + 6.5
  for (let i = 0; i < steps.length; i++) {
    const lines = wrap(doc, steps[i], w - 6.5, size)
    const need = Math.max(lines.length * lineHeight(size), 5)
    if (y + need > maxY) return { y, rest: i }
    doc.setFillColor(...COL.cut)
    doc.circle(x + 2.4, y - 0.9, 2.4, 'F')
    put(doc, `${startNo + i}`, x + 2.4, y - 0.9 + 7.5 * PT * 0.35, { size: 7.5, bold: true, color: COL.white, align: 'center' })
    lines.forEach((line, k) => put(doc, line, textX, y + k * lineHeight(size), { size }))
    y += need + gap
  }
  return { y, rest: steps.length }
}

const PARTS_COLS = [0.24, 0.38, 0.38]

/** Height the whole parts table needs at this width (header included). */
function partsHeight(doc: JsPdfDoc, rows: TableRow[], w: number, size = 8): number {
  const cw = PARTS_COLS.map((f) => w * f)
  return (
    4.4 +
    rows.reduce((t, r) => {
      const lines = [r.name, r.size, r.what].map((c, i) => wrap(doc, c, cw[i] - 2, size).length)
      return t + Math.max(...lines) * lineHeight(size) + 1.8
    }, 0)
  )
}

/** Draws parts rows until `maxY`; returns how many were drawn. */
function drawParts(doc: JsPdfDoc, rows: TableRow[], x: number, y: number, w: number, maxY: number, withHeader: boolean, size = 8): { y: number; done: number } {
  const cw = PARTS_COLS.map((f) => w * f)
  if (withHeader) {
    if (y + 5.5 > maxY) return { y, done: 0 }
    doc.setFillColor(240, 237, 231)
    doc.rect(x, y - 3.6, w, 5.2, 'F')
    put(doc, 'Name', x + 1, y, { size, bold: true, color: COL.muted })
    put(doc, 'Size (W × H)', x + cw[0] + 1, y, { size, bold: true, color: COL.muted })
    put(doc, 'What it is', x + cw[0] + cw[1] + 1, y, { size, bold: true, color: COL.muted })
    y += 4.4
  }
  let done = 0
  for (const r of rows) {
    const cells = [r.name, r.size, r.what]
    const wrapped = cells.map((c, i) => wrap(doc, c, cw[i] - 2, size))
    const h = Math.max(...wrapped.map((l) => l.length)) * lineHeight(size)
    if (y - 2.4 + h + 1.8 > maxY) break
    wrapped.forEach((lines, i) => {
      const cx = x + cw.slice(0, i).reduce((a, b) => a + b, 0) + 1
      lines.forEach((line, k) => put(doc, line, cx, y + k * lineHeight(size), { size, bold: i === 0 }))
    })
    y += h + 0.4
    doc.setDrawColor(...COL.rule)
    doc.setLineWidth(0.15)
    doc.line(x, y - 1.9, x + w, y - 1.9)
    y += 1.4
    done++
  }
  return { y, done }
}

function drawInfoColumn(doc: JsPdfDoc, page: PrintPage, box: Box, compact = false): { steps: number; rows: number } {
  const stepSize = compact ? 8 : 9
  const partsSize = compact ? 7.5 : 8
  const x = box.x
  const w = box.w
  const maxY = box.y + box.h
  let y = box.y + 3
  y = drawStats(doc, sheetStats(page.sheet), page.sheet.isNew, x, y, w, compact)

  y = heading(doc, 'Cut from', x, y + 1, w)
  for (const line of wrap(doc, page.sourceText, w, 9)) {
    put(doc, line, x, y, { size: 9 })
    y += lineHeight(9)
  }
  put(doc, `Sheet size ${page.sheetSizeText}`, x, y, { size: 9 })
  y += lineHeight(9)
  for (const line of wrap(doc, page.bladeText, w, 9)) {
    put(doc, line, x, y, { size: 9, color: COL.muted })
    y += lineHeight(9)
  }

  y = heading(doc, 'Cut order', x, y + 3, w)
  let stepsDone = page.cutOrder.length
  const rows = tableRows(page.blocks)
  const partsBlock = 11 + partsHeight(doc, rows, w, partsSize)
  if (page.cutOrder.length === 0) {
    put(doc, 'Nothing to cut on this sheet.', x, y, { size: 9 })
    y += 6
  } else {
    for (const line of wrap(doc, 'Measure each cut from the top-left corner of the area being cut.', w, 8)) {
      put(doc, line, x, y, { size: 8, color: COL.muted })
      y += lineHeight(8)
    }
    y += 1.5
    // Cut order first, whole if it fits; the parts table then follows here if it also fits whole,
    // otherwise it moves to the next page rather than being split in two.
    const r = drawSteps(doc, page.cutOrder, 1, x, y, w, maxY, stepSize, compact ? 0.7 : 1.4)
    y = r.y
    stepsDone = r.rest
  }

  let rowsDone = 0
  if (stepsDone === page.cutOrder.length && y + partsBlock <= maxY + 1) {
    y = heading(doc, 'Parts', x, y + 2, w)
    rowsDone = drawParts(doc, rows, x, y, w, maxY, true, partsSize).done
  }
  return { steps: stepsDone, rows: rowsDone }
}

/** Anything that did not fit beside the drawing continues on a page of its own. */
function drawContinuation(doc: JsPdfDoc, page: PrintPage, job: JobFacts, pageW: number, pageH: number, stepsDone: number, rowsDone: number) {
  const rows = tableRows(page.blocks)
  let sd = stepsDone
  let rd = rowsDone
  while (sd < page.cutOrder.length || rd < rows.length) {
    doc.addPage()
    let y = drawHeader(doc, page, job, pageW, true)
    const x = MARGIN
    const w = pageW - MARGIN * 2
    const maxY = pageH - MARGIN - FOOTER_H
    if (sd < page.cutOrder.length) {
      y = heading(doc, 'Cut order (continued)', x, y, w)
      const r = drawSteps(doc, page.cutOrder.slice(sd), sd + 1, x, y, w, maxY)
      y = r.y
      sd += Math.max(r.rest, 1)
      if (sd < page.cutOrder.length) {
        drawFooter(doc, page, pageH)
        continue
      }
    }
    if (rd < rows.length) {
      y = heading(doc, rd === 0 ? 'Parts' : 'Parts (continued)', x, y + 2, w)
      const r = drawParts(doc, rows.slice(rd), x, y, w, maxY, true)
      rd += Math.max(r.done, 1)
    }
    drawFooter(doc, page, pageH)
  }
}

/** A stand-in for the document that measures text like the real one but draws nothing. */
function dryRun(doc: JsPdfDoc): JsPdfDoc {
  const d = Object.create(doc) as Record<string, unknown>
  for (const k of ['text', 'rect', 'roundedRect', 'circle', 'line', 'setFillColor', 'setDrawColor', 'setLineWidth', 'setLineDashPattern', 'setTextColor']) {
    d[k] = () => d
  }
  return d as unknown as JsPdfDoc
}

/**
 * Builds the actual multi-page PDF Blob for a job, one page per sheet (more only when a very
 * long cut order or parts list does not fit beside the drawing). It uses the same PrintPage[]
 * model the on-screen print preview uses so the content always matches, plus the saved cut
 * (when given) for the client's name, phone and sheet number. Everything is vector
 * rect/line/text in Helvetica, so it works fully offline. jsPDF itself must be dynamically
 * imported by the caller so it never lands in the main bundle.
 */
export async function buildPrintPdf(
  pages: PrintPage[],
  paperSize: Settings['paperSize'],
  JsPDF: new (opts: jsPDFOptions) => JsPdfDoc,
  cut?: CutDoc,
): Promise<Blob> {
  const size = PAGE_MM[paperSize]
  const doc = new JsPDF({ unit: 'mm', format: paperSize === 'A4' ? 'a4' : 'letter' })
  const job = jobFacts(pages, cut)

  pages.forEach((page, i) => {
    if (i > 0) doc.addPage()
    const top = drawHeader(doc, page, job, size.w, false)
    const bottom = size.h - MARGIN - FOOTER_H
    const infoBox: Box = { x: size.w - MARGIN - INFO_W, y: top, w: INFO_W, h: bottom - top }
    const diagramBox: Box = { x: MARGIN, y: top, w: infoBox.x - COL_GAP - MARGIN, h: bottom - top }
    drawDiagram(doc, page, diagramBox)
    // Normal-size text if the whole column fits beside the drawing, slightly tighter text if
    // that makes it fit, and only then a continuation page.
    const fits = (r: { steps: number; rows: number }) => r.steps === page.cutOrder.length && r.rows === tableRows(page.blocks).length
    const dry = dryRun(doc)
    const normal = drawInfoColumn(dry, page, infoBox, false)
    const compact = fits(normal) ? normal : drawInfoColumn(dry, page, infoBox, true)
    const left = drawInfoColumn(doc, page, infoBox, !fits(normal) && fits(compact))
    drawFooter(doc, page, size.h)
    drawContinuation(doc, page, job, size.w, size.h, left.steps, left.rows)
  })

  // Page numbers last, so they count the real pages (a long sheet can run onto a second one).
  const total = doc.getNumberOfPages()
  for (let i = 1; i <= total; i++) {
    doc.setPage(i)
    put(doc, `Page ${i} of ${total}`, size.w - MARGIN, size.h - MARGIN + 2, { size: 8, color: COL.muted, align: 'right' })
  }

  return doc.output('blob')
}
