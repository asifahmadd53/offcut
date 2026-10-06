import { computeWasteCells } from './diagramLayout'
import { spreadPositions } from './diagramStyle'
import { plural } from './format'
import { fmt, sizeFormatter, sizeStyleOf, type Formatter } from './inches'
import { SvgDoc, type DrawDoc, type RGB } from './svgDoc'
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
// much of the sheet is used, the drawing and every part with its size. One page
// per sheet, always — a busy sheet gets smaller type and a second column in the
// parts list, never a second page. The Print screen draws these very same pages
// (through SvgDoc), so printing and saving give the identical document.
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

/**
 * How the sizes the app works out itself (not the ones typed) are written on these pages;
 * set once per document in drawJob from how the job's sizes were typed.
 */
let F: Formatter = sizeFormatter('fraction')

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
function put(doc: DrawDoc, text: string, x: number, y: number, st: TextStyle) {
  doc.setFont('helvetica', st.bold ? 'bold' : 'normal')
  doc.setFontSize(st.size)
  doc.setTextColor(...(st.color ?? COL.ink))
  const opts: { align: 'left' | 'center' | 'right'; angle?: number } = { align: st.align ?? 'left' }
  if (st.angle) opts.angle = st.angle
  doc.text(text, x, y, opts)
}

function widthOf(doc: DrawDoc, text: string, size: number, bold = false): number {
  doc.setFont('helvetica', bold ? 'bold' : 'normal')
  doc.setFontSize(size)
  return doc.getTextWidth(text)
}

function wrap(doc: DrawDoc, text: string, maxW: number, size: number, bold = false): string[] {
  doc.setFont('helvetica', bold ? 'bold' : 'normal')
  doc.setFontSize(size)
  const r = doc.splitTextToSize(text, maxW)
  return Array.isArray(r) ? r : [String(r)]
}

function ellipsize(doc: DrawDoc, text: string, maxW: number, size: number, bold = false): string {
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

export { spreadPositions }

// ---------- Parts: cutting pieces and leftovers are never mixed ----------

export interface PartRow {
  name: string
  size: string
}

export interface PartSection {
  title: string
  /** Small reminder on the heading line, e.g. how to read the sizes. */
  note?: string
  rows: PartRow[]
}

/**
 * The parts list: the pieces to cut, and what was cut earlier. Leftovers are not listed
 * here (they are drawn, labelled, and counted in "How much is used"). Pieces keep the size
 * as typed (R16).
 */
export function partSections(blocks: Block[]): PartSection[] {
  const pieces: PartRow[] = blocks
    .filter((b) => b.kind === 'cut')
    .sort((p, q) => (p.n ?? 0) - (q.n ?? 0))
    .map((b) => ({
      name: `Piece ${b.n ?? ''}${b.rotated ? ' (turned)' : ''}`,
      size: b.label ?? F.fmtDims(b.w, b.h),
    }))
  const earlier: PartRow[] = blocks
    .filter((b) => b.kind === 'earlier')
    .map((b) => ({ name: 'Already cut', size: F.fmtDims(b.w, b.h) }))
  return [
    { title: 'Cutting pieces', note: 'W × H, inches', rows: pieces },
    { title: 'Already cut earlier', rows: earlier },
  ].filter((s) => s.rows.length > 0)
}

/** "Pieces 1-12, 14" from ["Piece 1", ...] — used only when a sheet has too many parts to list one by one. */
function joinNames(names: string[]): string {
  const nums = names.map((n) => /^Piece (\d+)/.exec(n)?.[1]).filter((n): n is string => n !== undefined).map(Number)
  if (nums.length !== names.length) return names.join(', ')
  nums.sort((a, b) => a - b)
  const parts: string[] = []
  for (let i = 0; i < nums.length; ) {
    let j = i
    while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++
    parts.push(j > i ? `${nums[i]}-${nums[j]}` : `${nums[i]}`)
    i = j + 1
  }
  return `Pieces ${parts.join(', ')}`
}

/** Same sizes folded into one row each ("Pieces 1-12   35 × 65 ×12"): the last resort for a huge sheet. */
function groupSections(sections: PartSection[]): PartSection[] {
  return sections.map((sec) => {
    const groups = new Map<string, string[]>()
    for (const r of sec.rows) {
      const turned = r.name.endsWith('(turned)')
      const key = `${r.size}${turned ? '|turned' : ''}`
      groups.set(key, [...(groups.get(key) ?? []), r.name])
    }
    const rows = [...groups].map(([key, names]) => {
      const [size, turned] = key.split('|')
      if (names.length === 1) return { name: names[0], size }
      const plain = names.map((n) => n.replace(' (turned)', ''))
      return { name: `${joinNames(plain)}${turned ? ' (turned)' : ''}`, size: `${size} ×${names.length}` }
    })
    return { ...sec, rows }
  })
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

function drawHeader(doc: DrawDoc, page: PrintPage, job: JobFacts, pageW: number): number {
  const innerW = pageW - MARGIN * 2
  let y = MARGIN + 3
  put(doc, 'OFFCUT  ·  Cutting plan', MARGIN, y, { size: 9, bold: true, color: COL.brand })
  put(doc, `Sheet ${page.sheetIndex + 1} of ${page.sheetTotal}`, pageW - MARGIN, y + 1, {
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

function drawFooter(doc: DrawDoc, page: PrintPage, pageH: number) {
  put(doc, page.footerLeft, MARGIN, pageH - MARGIN + 2, { size: 8, color: COL.muted })
}

// ---------- The drawing ----------

interface Box {
  x: number
  y: number
  w: number
  h: number
}

interface LabelCandidate {
  lines: string[]
  /** One line written up the block (bottom to top) instead of across it. */
  vertical?: boolean
}

/**
 * What a block can carry, richest first: a piece writes "#15" / "W 10.5" / "H 38.6" on three
 * short lines when it has room, else "#9 · 4w × 27.6h" on one line across or up the block,
 * else just its number (its size then goes in a note with a line to the block).
 */
function labelCandidates(b: Block): LabelCandidate[] {
  const plain = F.fmtDims(b.w, b.h)
  if (b.kind === 'cut') {
    const [w, h] = (b.label ?? plain).split(' × ')
    const n = `#${b.n ?? ''}`
    const one = `${n} · ${w}w × ${h}h`
    return [{ lines: [n, `W ${w}`, `H ${h}`] }, { lines: [one] }, { lines: [one], vertical: true }, { lines: [n] }]
  }
  // A leftover shows just its letter (its size is not printed); too small for even that, it
  // gets a note with a line to it.
  if (b.kind === 'free' || b.kind === 'freeNew' || b.kind === 'focus') return [{ lines: [b.letter ?? ''] }]
  if (b.kind === 'earlier') return [{ lines: ['Already cut', plain] }, { lines: [plain] }, { lines: [plain], vertical: true }]
  return [{ lines: ['Waste'] }]
}

function inkFor(b: Block): RGB {
  if (b.kind === 'cut') return COL.blueInk
  if (b.kind === 'earlier') return COL.earlierInk
  if (b.kind === 'waste') return COL.wasteInk
  return COL.greenInk
}

interface LabelFit {
  lines: string[]
  size: number
  /** Only the bare number/letter fits, so the size still goes in a note with a line. */
  tag: boolean
  vertical: boolean
}

function fitBlockLabel(doc: DrawDoc, b: Block, pw: number, ph: number): LabelFit | null {
  const pad = 1.2
  const cands = labelCandidates(b)
  const leftover = b.kind === 'free' || b.kind === 'freeNew' || b.kind === 'focus'
  for (let ci = 0; ci < cands.length; ci++) {
    const { lines, vertical = false } = cands[ci]
    const tagOnly = ci === cands.length - 1 && cands.length > 1
    for (let size = leftover ? 16 : 10; size >= (tagOnly ? 7 : 7.5); size -= 0.5) {
      const lh = lineHeight(size)
      const totalH = lines.length * lh
      const maxW = Math.max(...lines.map((l, i) => widthOf(doc, l, size, i === 0)))
      const fits = vertical ? maxW <= ph - pad * 2 && lh <= pw - pad * 2 : maxW <= pw - pad * 2 && totalH <= ph - pad * 2
      if (fits) return { lines, size, tag: tagOnly, vertical }
    }
  }
  return null
}

function drawLegend(doc: DrawDoc, sheet: SheetPlan, blocks: Block[], x: number, y: number, maxW: number) {
  const items: Array<{ key: 'blue' | 'green' | 'earlier' | 'cut'; text: string }> = [
    { key: 'blue', text: 'Piece to cut' },
    { key: 'green', text: 'Leftover' },
  ]
  if (blocks.some((b) => b.kind === 'earlier')) items.push({ key: 'earlier', text: 'Already cut' })
  if ((sheet.cuts ?? []).length > 0) items.push({ key: 'cut', text: 'Cut line' })
  const size = 8.5
  const itemW = (t: string) => 7 + widthOf(doc, t, size)
  let cx = x
  let cy = y
  for (const it of items) {
    if (cx > x && cx + itemW(it.text) > x + maxW) {
      cx = x
      cy += 5.5
    }
    if (it.key === 'cut') {
      doc.setDrawColor(...COL.cut)
      doc.setLineWidth(0.45)
      doc.setLineDashPattern([1.2, 0.8], 0)
      doc.line(cx, cy - 1, cx + 5.4, cy - 1)
      doc.setLineDashPattern([], 0)
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
    put(doc, it.text, cx + 7, cy, { size, color: COL.muted })
    cx += itemW(it.text) + 5
  }
  const note = 'W = width, H = height, inches'
  if (cx > x && cx + widthOf(doc, note, size) > x + maxW) {
    cx = x
    cy += 5.5
  }
  put(doc, note, cx, cy, { size, color: COL.muted })
}

interface BlockFit {
  block: Block
  fit: LabelFit | null
}

interface DiagramPlan {
  sc: number
  X0: number
  Y0: number
  X1: number
  Y1: number
  fits: BlockFit[]
  wasteFits: Array<{ cell: { x: number; y: number; w: number; h: number }; fit: LabelFit }>
  callouts: Array<{ name: string; dims: string; ax: number; ay: number; ink: RGB }>
}

/** Works out scale and every label for one margin width — nothing is drawn yet. */
function planDiagram(doc: DrawDoc, page: PrintPage, box: Box, zoneRight: number, wasteCells: ReturnType<typeof computeWasteCells>): DiagramPlan {
  const { sheet, blocks } = page
  const zone = { top: 20, left: 21, bottom: 20 }
  const availW = box.w - zone.left - zoneRight
  const availH = box.h - zone.top - zone.bottom
  const sc = Math.min(availW / sheet.sheetW, availH / sheet.sheetH)
  const X0 = box.x + zone.left + (availW - sheet.sheetW * sc) / 2
  const Y0 = box.y + zone.top
  const X1 = X0 + sheet.sheetW * sc
  const Y1 = Y0 + sheet.sheetH * sc
  const X = (inX: number) => X0 + inX * sc
  const Y = (inY: number) => Y0 + inY * sc

  const fits: BlockFit[] = []
  const callouts: DiagramPlan['callouts'] = []
  for (const b of blocks) {
    const fit = fitBlockLabel(doc, b, b.w * sc, b.h * sc)
    fits.push({ block: b, fit })
    // A block that can only show its bare number or letter still gets its size in a note with a line to it.
    if ((!fit || fit.tag) && b.kind !== 'waste') {
      const name = b.kind === 'cut' ? `Piece ${b.n ?? ''}` : b.kind === 'earlier' ? 'Already cut' : `Leftover ${b.letter ?? ''}`
      const dims = b.kind === 'cut' ? (b.label ?? F.fmtDims(b.w, b.h)) : b.kind === 'earlier' ? F.fmtDims(b.w, b.h) : ''
      callouts.push({ name, dims, ax: X(b.x + b.w), ay: Y(b.y + b.h / 2), ink: inkFor(b) })
    }
  }
  // Waste regions inside the cut area say so when they have room.
  const wasteFits: DiagramPlan['wasteFits'] = []
  const r = sheet.region
  for (const c of wasteCells) {
    const inside = c.x >= r.x - 1e-6 && c.y >= r.y - 1e-6 && c.x + c.w <= r.x + r.w + 1e-6 && c.y + c.h <= r.y + r.h + 1e-6
    if (!inside) continue
    const fit = fitBlockLabel(doc, { kind: 'waste', x: c.x, y: c.y, w: c.w, h: c.h }, c.w * sc, c.h * sc)
    if (fit) wasteFits.push({ cell: c, fit })
  }
  return { sc, X0, Y0, X1, Y1, fits, wasteFits, callouts }
}

function drawDiagram(doc: DrawDoc, page: PrintPage, box: Box) {
  const { sheet, blocks } = page
  const sheetW = sheet.sheetW
  const sheetH = sheet.sheetH
  const wasteCells = computeWasteCells(blocks, { x: 0, y: 0, w: sheetW, h: sheetH })

  // Blocks too small for any text get a note in the right margin; give that margin room
  // only when some block needs it, so an ordinary sheet is drawn as large as possible.
  let plan = planDiagram(doc, page, box, 4, wasteCells)
  if (plan.callouts.length > 0) plan = planDiagram(doc, page, box, 30, wasteCells)
  const { sc, X0, Y0, X1, Y1, fits, wasteFits, callouts } = plan
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

  // Where the saw goes: the dashed cut lines (no order is printed).
  doc.setDrawColor(...COL.cut)
  doc.setLineWidth(0.45)
  doc.setLineDashPattern([1.6, 1.1], 0)
  for (const c of sheet.cuts ?? []) {
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
    if (fit.vertical) {
      const text = fit.lines[0]
      put(doc, text, cx + fit.size * PT * 0.3, cy + widthOf(doc, text, fit.size) / 2, { size: fit.size, color: inkFor(b), angle: 90 })
      continue
    }
    const lh = lineHeight(fit.size)
    const top = cy - (fit.lines.length * lh) / 2
    fit.lines.forEach((line, i) => {
      put(doc, line, cx, top + i * lh + fit.size * PT * 0.95, { size: fit.size, bold: i === 0, color: inkFor(b), align: 'center' })
    })
  }
  for (const { cell, fit } of wasteFits) {
    put(doc, 'Waste', X(cell.x) + (cell.w * sc) / 2, Y(cell.y) + (cell.h * sc) / 2 + fit.size * PT * 0.35, { size: fit.size, color: COL.wasteInk, align: 'center' })
  }

  // Margin notes for the blocks too small to write on: two lines each, or one line each when
  // there are so many that two would not fit. Every one is also listed in the parts below.
  const ordered = [...callouts].sort((a, b) => a.ay - b.ay)
  const gutterX = X1 + 5
  const gutterW = box.x + box.w - gutterX
  const span = Y1 + 3 - (Y0 + 3)
  const twoLine = ordered.length <= Math.floor(span / 8.4) + 1
  const ys = spreadPositions(ordered.map((c) => c.ay), twoLine ? 8.4 : 4.2, Y0 + 3, Y1 + 3)
  ys.forEach((yy, i) => {
    const c = ordered[i]
    doc.setDrawColor(...COL.faint)
    doc.setLineWidth(0.2)
    doc.setLineDashPattern([0.4, 0.5], 0)
    doc.line(c.ax, c.ay, gutterX - 1, yy - 1)
    doc.setLineDashPattern([], 0)
    if (twoLine) {
      put(doc, ellipsize(doc, c.name, gutterW, 8, true), gutterX, yy, { size: 8, bold: true, color: c.ink })
      if (c.dims) put(doc, ellipsize(doc, c.dims, gutterW, 8), gutterX, yy + 3.6, { size: 8, color: c.ink })
    } else {
      // One short line: just the number or letter and its size.
      const short = c.name.replace(/^Piece /, '').replace(/^Leftover /, '')
      put(doc, ellipsize(doc, `${short}  ${c.dims}`.trim(), gutterW, 7), gutterX, yy, { size: 7, color: c.ink })
    }
  })

  // Overall size: a dimension line above (width) and beside (height) the sheet.
  doc.setDrawColor(...COL.muted)
  doc.setLineWidth(0.25)
  const dimY = Y0 - 14.5
  doc.line(X0, dimY, X1, dimY)
  doc.line(X0, dimY - 1.4, X0, dimY + 1.4)
  doc.line(X1, dimY - 1.4, X1, dimY + 1.4)
  put(doc, `${F.fmt(sheetW)} in wide`, (X0 + X1) / 2, dimY - 1.8, { size: 9.5, bold: true, align: 'center' })
  const dimX = X0 - 14.5
  doc.line(dimX, Y0, dimX, Y1)
  doc.line(dimX - 1.4, Y0, dimX + 1.4, Y0)
  doc.line(dimX - 1.4, Y1, dimX + 1.4, Y1)
  const hText = `${F.fmt(sheetH)} in tall`
  const hW = widthOf(doc, hText, 9.5, true)
  put(doc, hText, dimX - 1.8, (Y0 + Y1) / 2 + hW / 2, { size: 9.5, bold: true, angle: 90 })

  drawLegend(doc, sheet, blocks, box.x, Y1 + 12, box.w)
}

// ---------- Information column ----------

function heading(doc: DrawDoc, text: string, x: number, y: number, w: number): number {
  put(doc, text.toUpperCase(), x, y, { size: 8, bold: true, color: COL.muted })
  doc.setDrawColor(...COL.rule)
  doc.setLineWidth(0.25)
  doc.line(x, y + 1.3, x + w, y + 1.3)
  return y + 5.5
}

function drawStats(doc: DrawDoc, stats: SheetStats, isNew: boolean, x: number, y: number, w: number): number {
  y = heading(doc, 'How much is used', x, y, w)
  put(doc, `${stats.usedPct}%`, x, y + 5, { size: 24, bold: true })
  put(doc, isNew ? 'of this sheet is used' : 'of this leftover is used', x + widthOf(doc, `${stats.usedPct}%`, 24, true) + 2, y + 5, { size: 9, color: COL.muted })
  y += 11
  const row = (swatch: RGB, label: string, pct: number) => {
    doc.setFillColor(...swatch)
    doc.rect(x, y - 2.4, 2.6, 2.6, 'F')
    put(doc, label, x + 4, y, { size: 9, bold: true })
    put(doc, `${pct}%`, x + w, y, { size: 9, bold: true, align: 'right' })
    y += lineHeight(9) + 0.8
  }
  row(COL.blue, 'Pieces cut', stats.usedPct)
  row(COL.green, 'Leftovers kept', stats.savedPct)
  row(COL.faint, 'Waste', stats.wastePct)
  return y + 2
}

// ---------- Parts layout: always fits the page ----------

interface PartsLayout {
  sections: PartSection[]
  size: number
  cols: number
  twoLine: boolean[]
  height: number
}

const SECTION_HEAD = 5.5
const SECTION_GAP = 4.5
const COL_SPACE = 2

function measurePartsLayout(doc: DrawDoc, sections: PartSection[], w: number, size: number, cols: number): PartsLayout {
  const colW = (w - COL_SPACE * (cols - 1)) / cols
  const lh = lineHeight(size)
  const twoLine = sections.map((sec) =>
    sec.rows.some((r) => widthOf(doc, r.name, size, true) + widthOf(doc, r.size, size) + 2.5 > colW),
  )
  let height = 0
  sections.forEach((sec, i) => {
    const rowH = (twoLine[i] ? 2 * lh : lh) + 0.7
    height += SECTION_HEAD + Math.ceil(sec.rows.length / cols) * rowH + SECTION_GAP
  })
  return { sections, size, cols, twoLine, height }
}

/**
 * The largest type (and the fewest columns) at which every part fits in `availH`. A sheet
 * with very many parts drops to a smaller type, then a second column, then — only in the
 * tightest mode — one row per size ("Pieces 1-12  35 × 65 ×12"). Never returns "next page".
 */
function layoutParts(doc: DrawDoc, sections: PartSection[], w: number, availH: number, sizes: number[], allowGroup: boolean): PartsLayout | null {
  const sets = allowGroup ? [sections, groupSections(sections)] : [sections]
  for (const set of sets) {
    for (const size of sizes) {
      for (const cols of [1, 2]) {
        const lay = measurePartsLayout(doc, set, w, size, cols)
        if (lay.height <= availH) return lay
      }
    }
  }
  return null
}

function drawParts(doc: DrawDoc, lay: PartsLayout, x: number, y: number, w: number): number {
  const colW = (w - COL_SPACE * (lay.cols - 1)) / lay.cols
  const lh = lineHeight(lay.size)
  lay.sections.forEach((sec, si) => {
    const headY = y
    y = heading(doc, `${sec.title} (${sec.rows.length})`, x, y, w)
    if (sec.note) put(doc, sec.note, x + w, headY, { size: 7, color: COL.muted, align: 'right' })
    const rowH = (lay.twoLine[si] ? 2 * lh : lh) + 0.7
    const perCol = Math.ceil(sec.rows.length / lay.cols)
    sec.rows.forEach((r, i) => {
      const c = Math.floor(i / perCol)
      const cx = x + c * (colW + COL_SPACE)
      const base = y + (i % perCol) * rowH + lay.size * PT * 0.95
      put(doc, r.name, cx, base, { size: lay.size, bold: true })
      if (lay.twoLine[si]) put(doc, r.size, cx, base + lh, { size: lay.size })
      else put(doc, r.size, cx + colW, base, { size: lay.size, align: 'right' })
    })
    y += perCol * rowH + SECTION_GAP
  })
  return y
}

function drawInfoColumn(doc: DrawDoc, page: PrintPage, box: Box, compact: boolean): { fits: boolean } {
  const x = box.x
  const w = box.w
  const maxY = box.y + box.h
  let y = box.y + 3
  y = drawStats(doc, sheetStats(page.sheet), page.sheet.isNew, x, y, w)

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
  y += 3

  const sections = partSections(page.blocks)
  const sizes = compact ? [8, 7.5, 7, 6.5, 6, 5.5, 5] : [8, 7.5, 7]
  const lay = layoutParts(doc, sections, w, maxY - y, sizes, compact)
  // Only an absurd sheet has no room even in the tightest mode; draw it as tight as it goes.
  const used = lay ?? measurePartsLayout(doc, groupSections(sections), w, 5, 2)
  drawParts(doc, used, x, y, w)
  return { fits: lay !== null }
}

/** A stand-in for the document that measures text like the real one but draws nothing. */
function dryRun(doc: DrawDoc): DrawDoc {
  const d = Object.create(doc) as Record<string, unknown>
  for (const k of ['text', 'rect', 'circle', 'line', 'setFillColor', 'setDrawColor', 'setLineWidth', 'setLineDashPattern', 'setTextColor']) {
    d[k] = () => d
  }
  return d as unknown as DrawDoc
}

/** Draws every sheet's page onto `doc`; the one place the saved PDF and the Print screen both come from. */
function drawJob(doc: DrawDoc, pages: PrintPage[], paperSize: Settings['paperSize'], cut?: CutDoc) {
  const size = PAGE_MM[paperSize]
  const job = jobFacts(pages, cut)
  F = sizeFormatter(sizeStyleOf(cut?.pieces))

  pages.forEach((page, i) => {
    if (i > 0) doc.addPage()
    const top = drawHeader(doc, page, job, size.w)
    const bottom = size.h - MARGIN - FOOTER_H
    const infoBox: Box = { x: size.w - MARGIN - INFO_W, y: top, w: INFO_W, h: bottom - top }
    const diagramBox: Box = { x: MARGIN, y: top, w: infoBox.x - COL_GAP - MARGIN, h: bottom - top }
    drawDiagram(doc, page, diagramBox)
    // Normal-size text if everything fits beside the drawing, tighter text if that makes it fit.
    const compact = !drawInfoColumn(dryRun(doc), page, infoBox, false).fits
    drawInfoColumn(doc, page, infoBox, compact)
    drawFooter(doc, page, size.h)
  })

  // Page numbers last, so they count the real pages.
  const total = doc.getNumberOfPages()
  for (let i = 1; i <= total; i++) {
    doc.setPage(i)
    put(doc, `Page ${i} of ${total}`, size.w - MARGIN, size.h - MARGIN + 2, { size: 8, color: COL.muted, align: 'right' })
  }
}

/**
 * Builds the actual PDF Blob for a job: exactly one page per sheet, however many pieces
 * it has. It uses the same PrintPage[] model the print builder produces, plus the saved cut
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
  const doc = new JsPDF({ unit: 'mm', format: paperSize === 'A4' ? 'a4' : 'letter' })
  drawJob(doc as unknown as DrawDoc, pages, paperSize, cut)
  return doc.output('blob')
}

/**
 * The same pages as `buildPrintPdf`, as one SVG string per page, for the Print screen. They
 * are produced by the very same drawing code (measured with jsPDF's own font metrics), so
 * what prints is what the saved PDF contains.
 */
export function buildPrintSvgPages(
  pages: PrintPage[],
  paperSize: Settings['paperSize'],
  JsPDF: new (opts: jsPDFOptions) => JsPdfDoc,
  cut?: CutDoc,
): string[] {
  const size = PAGE_MM[paperSize]
  const measure = new JsPDF({ unit: 'mm', format: paperSize === 'A4' ? 'a4' : 'letter' })
  const svg = new SvgDoc(measure as unknown as ConstructorParameters<typeof SvgDoc>[0], size.w, size.h)
  drawJob(svg, pages, paperSize, cut)
  return svg.svgPages()
}
