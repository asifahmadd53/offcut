import {
  allRectSizeLabels,
  chooseLabel,
  computeWasteCells,
  edgesToSegments,
  extractEdges,
  wasteLabelFits,
} from './diagramLayout'
import { fmt } from './inches'
import type { jsPDF as JsPdfDoc, jsPDFOptions } from 'jspdf'
import type { PrintPage } from './print'
import type { CutDoc, Settings } from './types'

/**
 * Turns a job's pieces/date into a safe file name, e.g. "Offcut - 23x77 2pcs - 2026-09-21".
 * Pure and DOM-free so it can be unit-tested without touching jsPDF or the browser at all.
 */
export function pdfFileName(cut: CutDoc): string {
  const first = cut.pieces?.[0]
  const pieceText = first ? `${fmt(first.w)}x${fmt(first.h)} ${first.qty}pcs` : 'sheet'
  const date = new Date(cut.createdAt)
  const dateText = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  const raw = `Offcut - ${pieceText} - ${dateText}`
  // Strip characters most filesystems reject; collapse the whitespace that leaves behind.
  return raw.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim() + '.pdf'
}

const PAGE_MM: Record<'A4' | 'Letter', { w: number; h: number }> = {
  A4: { w: 210, h: 297 },
  Letter: { w: 215.9, h: 279.4 },
}

const MARGIN_MM = 9
const ASIDE_MM = 46
const GAP_MM = 4

/** mm-space bounding box the diagram itself is drawn into on one page. */
interface DiagramBox {
  x: number
  y: number
  w: number
  h: number
}

/**
 * Draws one sheet's diagram (outline, blocks, labels, dimension lines) into `box` using
 * jsPDF's vector primitives — lines, rects and text, never a rasterized image — mirroring
 * SheetDiagram.tsx's geometry via the same pure functions from diagramLayout.ts, so the
 * PDF's drawing matches the on-screen/print-preview diagram exactly, just redrawn in mm.
 */
function drawDiagram(doc: JsPdfDoc, page: PrintPage, box: DiagramBox) {
  const { sheet, blocks } = page
  const sheetW = sheet.sheetW
  const sheetH = sheet.sheetH

  const topMargin = 10
  const leftMargin = 10
  const availW = box.w - leftMargin - 4
  const availH = box.h - topMargin - 4
  const pxPerInch = Math.min(availW / sheetW, availH / sheetH)
  const sheetPxW = sheetW * pxPerInch
  const sheetPxH = sheetH * pxPerInch

  const X = (inX: number) => box.x + leftMargin + inX * pxPerInch
  const Y = (inY: number) => box.y + topMargin + inY * pxPerInch

  doc.setLineWidth(0.15)

  // Waste cells, light grey fill.
  const region = { x: 0, y: 0, w: sheetW, h: sheetH }
  for (const c of computeWasteCells(blocks, region)) {
    const pw = c.w * pxPerInch
    const ph = c.h * pxPerInch
    doc.setFillColor(230, 227, 221)
    doc.rect(X(c.x), Y(c.y), pw, ph, 'F')
    doc.setDrawColor(150, 140, 120)
    doc.rect(X(c.x), Y(c.y), pw, ph, 'S')
    if (wasteLabelFits(pw, ph)) {
      doc.setFontSize(7)
      doc.setTextColor(120, 115, 105)
      doc.text('Waste', X(c.x) + pw / 2, Y(c.y) + ph / 2, { align: 'center', baseline: 'middle' })
    }
  }

  // Already-cut, free/freeNew, then cut pieces on top — same stacking order as the screen.
  for (const b of blocks.filter((x) => x.kind === 'earlier')) {
    const pw = b.w * pxPerInch
    const ph = b.h * pxPerInch
    doc.setFillColor(236, 232, 224)
    doc.rect(X(b.x), Y(b.y), pw, ph, 'F')
    doc.setDrawColor(115, 104, 83)
    doc.rect(X(b.x), Y(b.y), pw, ph, 'S')
    drawCenteredLabel(doc, chooseLabel(b, pxPerInch), X(b.x) + pw / 2, Y(b.y) + ph / 2, [95, 90, 80])
  }

  for (const b of blocks.filter((x) => x.kind === 'free' || x.kind === 'freeNew' || x.kind === 'focus')) {
    const pw = b.w * pxPerInch
    const ph = b.h * pxPerInch
    doc.setFillColor(230, 246, 236)
    doc.rect(X(b.x), Y(b.y), pw, ph, 'F')
    doc.setDrawColor(34, 139, 87)
    doc.setLineDashPattern([1, 0.8], 0)
    doc.rect(X(b.x), Y(b.y), pw, ph, 'S')
    doc.setLineDashPattern([], 0)
    const plan = chooseLabel(b, pxPerInch)
    const choice = plan.free!
    const cx = X(b.x) + pw / 2
    const cy = Y(b.y) + ph / 2
    doc.setTextColor(21, 92, 56)
    if (choice.kind === 'wide') {
      doc.setFontSize(9)
      const text = `${choice.letter} - ${choice.dims}${choice.showFree ? ' free' : ''}`
      doc.text(text, cx, cy, { align: 'center', baseline: 'middle' })
    } else if (choice.kind === 'stacked') {
      doc.setFontSize(8)
      doc.text(choice.letter, cx, cy - 1.6, { align: 'center', baseline: 'middle' })
      doc.text(choice.dims, cx, cy + 1.6, { align: 'center', baseline: 'middle' })
    }
  }

  for (const b of blocks.filter((x) => x.kind === 'cut')) {
    const pw = b.w * pxPerInch
    const ph = b.h * pxPerInch
    doc.setFillColor(219, 234, 254)
    doc.rect(X(b.x), Y(b.y), pw, ph, 'F')
    doc.setDrawColor(37, 99, 235)
    doc.rect(X(b.x), Y(b.y), pw, ph, 'S')
    drawCenteredLabel(doc, chooseLabel(b, pxPerInch), X(b.x) + pw / 2, Y(b.y) + ph / 2, [30, 64, 175])
  }

  // Callouts for every block too small for an inline label — the same rule as the screen
  // (a block never loses its size, R15), drawn as a short leader line + text to the right
  // of the sheet outline instead of overlapping the drawing. Text is fit to the remaining
  // space in `box` via getTextWidth (jsPDF's real font metrics, not an estimate) so it can
  // never run past the diagram box into the info column beside it — the direct fix for
  // callout text overlapping the header/info text on the right.
  const calloutBlocks = allRectSizeLabels(blocks, pxPerInch).filter((l) => l.placement === 'callout')
  let calloutY = Y(0) + 4
  doc.setFontSize(7)
  doc.setDrawColor(120, 115, 105)
  for (const c of calloutBlocks) {
    const b = blocks[c.blockIndex]
    const anchorX = X(b.x + b.w)
    const anchorY = Y(b.y + b.h / 2)
    const labelX = Math.min(anchorX + 4, box.x + box.w - 2)
    const maxTextWidth = Math.max(box.x + box.w - 2 - labelX, 6)
    const fullText = `${c.name}: ${c.width} x ${c.height}`
    const text = fitCalloutTextMm(doc, fullText, maxTextWidth)
    doc.setLineDashPattern([0.4, 0.6], 0)
    doc.line(anchorX, anchorY, labelX, calloutY)
    doc.setLineDashPattern([], 0)
    doc.setTextColor(90, 85, 75)
    doc.text(text, labelX, calloutY, { baseline: 'middle', maxWidth: maxTextWidth })
    calloutY += 3.4
  }

  // Sheet outline.
  doc.setDrawColor(60, 58, 52)
  doc.setLineWidth(0.3)
  doc.rect(X(0), Y(0), sheetPxW, sheetPxH, 'S')

  // Dimension segments, top (width) and left (height) — same edge-extraction as the screen.
  doc.setFontSize(7)
  doc.setTextColor(90, 85, 75)
  doc.setDrawColor(90, 85, 75)
  doc.setLineWidth(0.1)

  const dimBlocks = blocks.filter((b) => b.kind === 'cut' || b.kind === 'free' || b.kind === 'freeNew' || b.kind === 'focus')
  const xSegs = edgesToSegments(extractEdges(dimBlocks, 'x', 0, sheetW))
  for (const s of xSegs) {
    doc.text(s.label, X((s.from + s.to) / 2), Y(0) - 2, { align: 'center' })
  }
  const ySegs = edgesToSegments(extractEdges(dimBlocks, 'y', 0, sheetH))
  for (const s of ySegs) {
    doc.text(s.label, X(0) - 2, Y((s.from + s.to) / 2), { align: 'right', baseline: 'middle' })
  }

  doc.setFontSize(8)
  doc.setTextColor(60, 58, 52)
  doc.text(fmt(sheetW), X(sheetW / 2), Y(0) - 6, { align: 'center' })
  doc.text(fmt(sheetH), X(0) - 7, Y(sheetH / 2), { align: 'center', angle: 90 })
}

type LabelPlan = ReturnType<typeof chooseLabel>

function drawCenteredLabel(doc: JsPdfDoc, plan: LabelPlan, cx: number, cy: number, rgb: [number, number, number]) {
  doc.setTextColor(...rgb)
  if (plan.kind === 'piece' && plan.piece) {
    doc.setFontSize(8)
    if (plan.piece.kind === 'two-line' && plan.piece.line2) {
      doc.text(plan.piece.line1, cx, cy - 1.6, { align: 'center', baseline: 'middle' })
      doc.text(plan.piece.line2, cx, cy + 1.6, { align: 'center', baseline: 'middle' })
    } else if (plan.piece.kind !== 'legend') {
      doc.text(plan.piece.line1, cx, cy, { align: 'center', baseline: 'middle' })
    }
  } else if (plan.kind === 'earlier' && plan.earlier) {
    doc.setFontSize(8)
    if (plan.earlier.kind === 'two-line' && plan.earlier.line2) {
      doc.text(plan.earlier.line1, cx, cy - 1.6, { align: 'center', baseline: 'middle' })
      doc.text(plan.earlier.line2, cx, cy + 1.6, { align: 'center', baseline: 'middle' })
    } else if (plan.earlier.kind !== 'legend') {
      doc.text(plan.earlier.line1, cx, cy, { align: 'center', baseline: 'middle' })
    }
  }
}

function drawInfoColumn(doc: JsPdfDoc, page: PrintPage, box: DiagramBox) {
  let y = box.y + 5
  const x = box.x

  doc.setTextColor(27, 26, 23)
  doc.setFontSize(11)
  doc.text('Offcut', x, y)
  y += 4.5
  doc.setFontSize(9)
  doc.text(page.jobTitle, x, y, { maxWidth: box.w })
  y += 5
  doc.setFontSize(7)
  doc.setTextColor(95, 90, 80)
  doc.text(page.dateTimeText, x, y)
  y += 3.4
  doc.text(`Sheet ${page.sheetIndex + 1} of ${page.sheetTotal}`, x, y)
  y += 5.5

  doc.text(`Sheet size ${page.sheetSizeText}`, x, y, { maxWidth: box.w })
  y += 3.4
  doc.text(page.sourceText, x, y, { maxWidth: box.w })
  y += splitLines(doc, page.sourceText, box.w) * 3.4
  doc.text(page.bladeText, x, y, { maxWidth: box.w })
  y += 5.5

  doc.setTextColor(27, 26, 23)
  doc.setFontSize(8)
  doc.text('Cut order', x, y)
  y += 3.6
  doc.setFontSize(7)
  doc.setTextColor(60, 58, 52)
  if (page.cutOrder.length === 0) {
    doc.text('Nothing to cut on this sheet.', x, y, { maxWidth: box.w })
    y += 3.2
  } else {
    for (let i = 0; i < page.cutOrder.length; i++) {
      const text = `${i + 1}. ${page.cutOrder[i]}`
      doc.text(text, x, y, { maxWidth: box.w })
      y += splitLines(doc, text, box.w) * 3.2
    }
  }
  y += 2.3

  doc.setTextColor(27, 26, 23)
  doc.setFontSize(8)
  doc.text('Parts', x, y)
  y += 3.6
  doc.setFontSize(6.5)
  const colW = [box.w * 0.4, box.w * 0.18, box.w * 0.18, box.w * 0.24]
  const headers = ['Name', 'W', 'H', 'Status']
  let cx = x
  doc.setTextColor(90, 85, 75)
  for (let i = 0; i < headers.length; i++) {
    doc.text(headers[i], cx, y)
    cx += colW[i]
  }
  y += 1
  doc.setDrawColor(210, 205, 195)
  doc.setLineWidth(0.1)
  doc.line(x, y, x + box.w, y)
  y += 2.6
  doc.setTextColor(60, 58, 52)
  const rowLineHeight = 2.6
  for (const row of page.parts) {
    const cells = [row.label, row.width, row.height, row.status]
    // A row's height must grow with whichever cell wraps to the most lines, or the next
    // row's text starts on top of this one's wrapped second line — the direct fix for
    // the Status column overlapping between rows.
    const lineCounts = cells.map((c, i) => splitLines(doc, c, colW[i] - 1))
    const rowHeight = Math.max(...lineCounts) * rowLineHeight
    if (y + rowHeight > box.y + box.h - 8) break // out of room; footer still needs its own space
    cx = x
    for (let i = 0; i < cells.length; i++) {
      doc.text(cells[i], cx, y, { maxWidth: colW[i] - 1 })
      cx += colW[i]
    }
    y += rowHeight
  }

  doc.setFontSize(6)
  doc.setTextColor(95, 90, 80)
  const footerY = box.y + box.h - 5
  doc.text(page.footerLeft, x, footerY, { maxWidth: box.w })
  doc.text(`Page ${page.pageNumber} of ${page.pageTotal}`, x, footerY + 3)
}

/**
 * Truncates a callout string to fit maxWidthMm at the doc's current font size, measured
 * with jsPDF's own getTextWidth (real font metrics), one character at a time with an
 * ellipsis — a single-line guarantee for a leader-line callout, distinct from
 * splitLines/wrapping used elsewhere for multi-line text blocks.
 */
function fitCalloutTextMm(doc: JsPdfDoc, text: string, maxWidthMm: number): string {
  if (doc.getTextWidth(text) <= maxWidthMm) return text
  let cur = text
  while (cur.length > 1 && doc.getTextWidth(cur + '…') > maxWidthMm) {
    cur = cur.slice(0, -1)
  }
  return cur + '…'
}

/** How many wrapped lines jsPDF's own splitTextToSize would produce, for simple line-advance math. */
function splitLines(doc: JsPdfDoc, text: string, maxWidth: number): number {
  const result = doc.splitTextToSize(text, maxWidth)
  return Array.isArray(result) ? result.length : 1
}

/**
 * Builds the actual multi-page PDF Blob for a job, one page per sheet, using the same
 * PrintPage[] page model the on-screen print preview uses (buildPrintPages) so the content
 * always matches. Everything is drawn with jsPDF's vector calls (lines/rects/text) rather
 * than rasterizing the screen, and only Helvetica's built-in characters are used (no custom
 * font embedding), so this works fully offline with jsPDF's own bundled font. jsPDF itself
 * must be dynamically imported by the caller so it never lands in the main bundle.
 */
export async function buildPrintPdf(
  pages: PrintPage[],
  paperSize: Settings['paperSize'],
  JsPDF: new (opts: jsPDFOptions) => JsPdfDoc,
): Promise<Blob> {
  const size = PAGE_MM[paperSize]
  const doc = new JsPDF({ unit: 'mm', format: paperSize === 'A4' ? 'a4' : 'letter' })

  pages.forEach((page, i) => {
    if (i > 0) doc.addPage()
    const diagramBox: DiagramBox = {
      x: MARGIN_MM,
      y: MARGIN_MM,
      w: size.w - MARGIN_MM * 2 - ASIDE_MM - GAP_MM,
      h: size.h - MARGIN_MM * 2,
    }
    const infoBox: DiagramBox = {
      x: diagramBox.x + diagramBox.w + GAP_MM,
      y: MARGIN_MM,
      w: ASIDE_MM,
      h: size.h - MARGIN_MM * 2,
    }
    drawDiagram(doc, page, diagramBox)
    drawInfoColumn(doc, page, infoBox)
  })

  return doc.output('blob')
}
