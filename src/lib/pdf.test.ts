import { jsPDF } from 'jspdf'
import { describe, expect, it } from 'vitest'
import { buildPrintPages } from './print'
import { buildPrintPdf, buildPrintSvgPages, partSections, pdfFileName, sheetStats, spreadPositions } from './pdf'
import { packJob } from './packer'
import { deriveStock } from './stock'
import { DEFAULT_SETTINGS } from './types'
import type { CutDoc, Piece, SheetPlan } from './types'

const opts = { sheetW: 48, sheetH: 96, kerf: 0, minLeftover: 1 }
const piece = (w: number, h: number, qty: number, id = `${w}x${h}`): Piece => ({ id, w, h, qty })

function cutFrom(pieces: Piece[], sheets: CutDoc['sheets'], createdAt = new Date('2026-09-21T10:00:00').getTime()): CutDoc {
  return {
    id: 'cut-1',
    type: 'cut',
    createdAt,
    syncedAt: 1,
    deviceId: 'd1',
    pieces,
    kerf: 0,
    sheets,
  }
}

describe('pdfFileName', () => {
  it('builds "Offcut - WxH Npcs - date.pdf" from the job\'s first piece and date', () => {
    const r = packJob([piece(23, 77, 2)], [], opts)
    const cut = cutFrom([piece(23, 77, 2)], r.sheets)
    expect(pdfFileName(cut)).toBe('Offcut - 23x77 2pcs - 2026-09-21.pdf')
  })

  it('strips characters that are unsafe in a file name', () => {
    const cut: CutDoc = {
      id: 'x',
      type: 'cut',
      createdAt: new Date('2026-01-05T00:00:00').getTime(),
      syncedAt: null,
      deviceId: 'd1',
      pieces: [{ id: 'p', w: 22.5, h: 30, qty: 1 }],
      kerf: 0,
      sheets: [],
    }
    const name = pdfFileName(cut)
    // "/" is deliberately kept (see pdfFileName's own comment) for a sheet number like
    // "34/56" — every other unsafe character is still stripped.
    expect(name).not.toMatch(/[\\:*?"<>|]/)
    expect(name.endsWith('.pdf')).toBe(true)
  })

  it('falls back gracefully when a job has no pieces', () => {
    const cut: CutDoc = {
      id: 'x',
      type: 'cut',
      createdAt: Date.now(),
      syncedAt: null,
      deviceId: 'd1',
      pieces: [],
      kerf: 0,
      sheets: [],
    }
    expect(pdfFileName(cut)).toMatch(/^Offcut - sheet - \d{4}-\d{2}-\d{2}\.pdf$/)
  })

  it('uses "{client} {sheet number}.pdf", writing "/" or "-" in the number as "by"', () => {
    const cut: CutDoc = {
      id: 'x',
      type: 'cut',
      createdAt: Date.now(),
      syncedAt: null,
      deviceId: 'd1',
      pieces: [{ id: 'p', w: 40, h: 30, qty: 1 }],
      kerf: 0,
      sheets: [],
      clientId: 'c1',
      clientName: 'Asif',
      sheetNumber: '34/66',
    }
    expect(pdfFileName(cut)).toBe('Asif 34 by 66.pdf')
    expect(pdfFileName({ ...cut, sheetNumber: '34 - 56' })).toBe('Asif 34 by 56.pdf')
    expect(pdfFileName({ ...cut, sheetNumber: '34' })).toBe('Asif 34.pdf')
    expect(pdfFileName({ ...cut, sheetNumber: '34/66' })).not.toMatch(/[/-]/)
  })

  it('uses just the client name when there is no sheet number', () => {
    const cut: CutDoc = {
      id: 'x',
      type: 'cut',
      createdAt: new Date('2026-09-21T10:00:00').getTime(),
      syncedAt: null,
      deviceId: 'd1',
      pieces: [{ id: 'p', w: 23, h: 77, qty: 2 }],
      kerf: 0,
      sheets: [],
      clientId: 'c1',
      clientName: 'Asif',
    }
    expect(pdfFileName(cut)).toBe('Asif.pdf')
    expect(pdfFileName({ ...cut, sheetNumber: '   ' })).toBe('Asif.pdf')
    expect(pdfFileName({ ...cut, clientName: undefined })).toBe('Offcut - 23x77 2pcs - 2026-09-21.pdf')
  })
})

describe('buildPrintPdf', () => {
  it('produces one PDF page per sheet for a 1-sheet job', async () => {
    const r = packJob([piece(23, 77, 2)], [], opts)
    const cut = cutFrom([piece(23, 77, 2)], r.sheets)
    const derived = deriveStock([cut])
    const pages = buildPrintPages(cut, derived, DEFAULT_SETTINGS)
    const blob = await buildPrintPdf(pages, 'A4', jsPDF)
    const text = await blob.text()
    expect(countPdfPages(text)).toBe(1)
  })

  it('produces one PDF page per sheet for a 2-sheet job', async () => {
    const r = packJob([piece(48, 96, 2)], [], opts)
    expect(r.sheets).toHaveLength(2)
    const cut = cutFrom([piece(48, 96, 2)], r.sheets)
    const derived = deriveStock([cut])
    const pages = buildPrintPages(cut, derived, DEFAULT_SETTINGS)
    const blob = await buildPrintPdf(pages, 'A4', jsPDF)
    const text = await blob.text()
    expect(countPdfPages(text)).toBe(2)
  })

  it('produces one PDF page per sheet for a 3-sheet job', async () => {
    const stockPlan = packJob([piece(10, 10, 1)], [], opts)
    const seedCut = cutFrom([piece(10, 10, 1)], stockPlan.sheets)
    const d0 = deriveStock([seedCut])
    const r = packJob(
      [piece(10, 10, 1), piece(48, 96, 2)],
      d0.freeLeftovers,
      opts,
      new Set(),
      d0.sheetLetters,
    )
    expect(r.sheets.length).toBe(3)
    const cut = cutFrom([piece(10, 10, 1), piece(48, 96, 2)], r.sheets)
    const derived = deriveStock([seedCut, cut])
    const pages = buildPrintPages(cut, derived, DEFAULT_SETTINGS)
    const blob = await buildPrintPdf(pages, 'A4', jsPDF)
    const text = await blob.text()
    expect(countPdfPages(text)).toBe(3)
  })

  it('the produced blob is a real PDF (starts with %PDF)', async () => {
    const r = packJob([piece(23, 77, 2)], [], opts)
    const cut = cutFrom([piece(23, 77, 2)], r.sheets)
    const derived = deriveStock([cut])
    const pages = buildPrintPages(cut, derived, DEFAULT_SETTINGS)
    const blob = await buildPrintPdf(pages, 'A4', jsPDF)
    const text = await blob.text()
    expect(text.startsWith('%PDF')).toBe(true)
  })

  it('respects the Letter paper size', async () => {
    const r = packJob([piece(23, 77, 2)], [], opts)
    const cut = cutFrom([piece(23, 77, 2)], r.sheets)
    const derived = deriveStock([cut])
    const pages = buildPrintPages(cut, derived, DEFAULT_SETTINGS)
    const blob = await buildPrintPdf(pages, 'Letter', jsPDF)
    const text = await blob.text()
    expect(text.startsWith('%PDF')).toBe(true)
  })

  it('builds a valid multi-page PDF for a crowded, many-piece job at both paper sizes', async () => {
    // A dense job (many small pieces + a big leftover-producing piece) mirrors the
    // screenshot's crowded sheet: several tiny strips, several already-cut-style blocks
    // across pages, and a parts table long enough to risk the old row-height bug.
    const stockPlan = packJob([piece(10, 10, 1)], [], opts)
    const seedCut = cutFrom([piece(10, 10, 1)], stockPlan.sheets)
    const d0 = deriveStock([seedCut])
    const r = packJob(
      [piece(8.7, 18, 6), piece(1.6, 18, 1), piece(48, 96, 1)],
      d0.freeLeftovers,
      opts,
      new Set(),
      d0.sheetLetters,
    )
    const cut = cutFrom([piece(8.7, 18, 6), piece(1.6, 18, 1), piece(48, 96, 1)], r.sheets)
    const derived = deriveStock([seedCut, cut])
    const pages = buildPrintPages(cut, derived, DEFAULT_SETTINGS)
    expect(pages.length).toBeGreaterThan(0)

    for (const paperSize of ['A4', 'Letter'] as const) {
      const blob = await buildPrintPdf(pages, paperSize, jsPDF)
      const text = await blob.text()
      expect(text.startsWith('%PDF')).toBe(true)
      expect(countPdfPages(text)).toBe(pages.length)
    }
  })
})

/** Counts "/Type /Page" (not "/Pages") object entries in the raw PDF body. */
function countPdfPages(pdfText: string): number {
  const matches = pdfText.match(/\/Type\s*\/Page[^s]/g)
  return matches ? matches.length : 0
}

describe('sheetStats', () => {
  it('splits a sheet into pieces, kept leftovers and waste that add up exactly', () => {
    const r = packJob([piece(23, 77, 2)], [], opts)
    const st = sheetStats(r.sheets[0])
    expect(st.regionArea).toBe(48 * 96)
    expect(st.used).toBe(2 * 23 * 77)
    expect(st.saved).toBe(48 * 19 + 2 * 77)
    expect(st.used + st.saved + st.waste).toBe(st.regionArea)
    expect(st.usedPct + st.savedPct + st.wastePct).toBe(100)
    expect(st.pieces).toBe(2)
    expect(st.leftovers).toBe(2)
  })

  it('always adds up, with the blade on and for many different jobs', () => {
    let seed = 7
    const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296
    for (let k = 0; k < 60; k++) {
      const pieces = Array.from({ length: 1 + Math.floor(rnd() * 5) }, (_, i) =>
        piece(Math.round((4 + rnd() * 40) * 16) / 16, Math.round((4 + rnd() * 85) * 16) / 16, 1 + Math.floor(rnd() * 3), `p${i}`),
      )
      for (const sheet of packJob(pieces, [], { ...opts, kerf: 1 / 16 }).sheets) {
        const st = sheetStats(sheet)
        expect(st.used + st.saved + st.waste).toBe(st.regionArea)
        expect(st.waste).toBeGreaterThanOrEqual(0)
        expect(st.usedPct + st.savedPct + st.wastePct).toBe(100)
        const pct = Math.round((sheet.placements.reduce((t, q) => t + q.w * q.h, 0) / (sheet.region.w * sheet.region.h)) * 100)
        expect(st.usedPct).toBe(pct)
      }
    }
  })
})

describe('spreadPositions', () => {
  it('keeps neighbours apart, inside the range, and drops what cannot fit', () => {
    expect(spreadPositions([10, 11, 12], 4, 0, 100)).toEqual([10, 14, 18])
    expect(spreadPositions([98, 99, 100], 4, 0, 100)).toEqual([92, 96, 100])
    expect(spreadPositions([0, 1, 2, 3, 4, 5], 4, 0, 8)).toHaveLength(3)
  })
})

describe('partSections', () => {
  it('lists the cutting pieces only; leftovers are not in the parts list', () => {
    const r = packJob([piece(23, 77, 2)], [], opts)
    const cut = cutFrom([piece(23, 77, 2)], r.sheets)
    const pages = buildPrintPages(cut, deriveStock([cut]), DEFAULT_SETTINGS)
    expect(partSections(pages[0].blocks)).toEqual([
      {
        title: 'Cutting pieces',
        rows: [
          { name: 'Piece 1', size: '23 × 77' },
          { name: 'Piece 2', size: '23 × 77' },
        ],
      },
    ])
  })
})

/** Records every text the PDF draws, with its box, so a test can prove nothing overlaps. */
interface TextBox {
  page: number
  text: string
  x0: number
  x1: number
  y0: number
  y1: number
}

function recorder(boxes: TextBox[]) {
  return class Rec extends jsPDF {
    constructor(opts: ConstructorParameters<typeof jsPDF>[0]) {
      super(opts)
      // jsPDF attaches text() to each document, so the recorder wraps that instance method.
      const original = this.text.bind(this) as (...a: unknown[]) => unknown
      ;(this as unknown as { text: (...a: unknown[]) => unknown }).text = (...args: unknown[]) => {
        const [text, x, y, opts2] = args as [string, number, number, { align?: string; angle?: number } | undefined]
        if (typeof text === 'string' && text.length > 0) {
          const w = this.getTextWidth(text)
          const h = this.getFontSize() * 0.3528
          const page = this.getCurrentPageInfo().pageNumber
          if (opts2?.angle === 90) boxes.push({ page, text, x0: x - h * 0.8, x1: x + h * 0.2, y0: y - w, y1: y })
          else {
            const x0 = opts2?.align === 'center' ? x - w / 2 : opts2?.align === 'right' ? x - w : x
            boxes.push({ page, text, x0, x1: x0 + w, y0: y - h * 0.75, y1: y + h * 0.2 })
          }
        }
        return original(...args)
      }
    }
  }
}

function overlaps(boxes: TextBox[]): string[] {
  const bad: string[] = []
  const t = 0.15
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]
      const b = boxes[j]
      if (a.page !== b.page) continue
      if (a.x0 < b.x1 - t && b.x0 < a.x1 - t && a.y0 < b.y1 - t && b.y0 < a.y1 - t) bad.push(`p${a.page}: "${a.text}" / "${b.text}"`)
    }
  }
  return bad
}

describe('PDF text never overlaps and stays on the page', () => {
  const withClient = (cut: CutDoc): CutDoc => ({ ...cut, clientId: 'c', clientName: 'Asif Ahmad', clientPhone: '0300 1234567', sheetNumber: '34/66' })

  async function check(cut: CutDoc, derived = deriveStock([cut]), paper: 'A4' | 'Letter' = 'A4') {
    const boxes: TextBox[] = []
    const pages = buildPrintPages(cut, derived, DEFAULT_SETTINGS)
    await buildPrintPdf(pages, paper, recorder(boxes) as unknown as typeof jsPDF, cut)
    const w = paper === 'A4' ? 210 : 215.9
    const h = paper === 'A4' ? 297 : 279.4
    const outside = boxes.filter((b) => b.x0 < 8 || b.x1 > w - 8 || b.y0 < 8 || b.y1 > h - 8).map((b) => `p${b.page}: "${b.text}"`)
    return { overlap: overlaps(boxes), outside, count: boxes.length }
  }

  it('a leftover cut on a sheet that was already partly used', async () => {
    const r1 = packJob([piece(36, 55, 1)], [], opts)
    const c1 = cutFrom([piece(36, 55, 1)], r1.sheets, 1)
    const d1 = deriveStock([c1])
    const A = d1.freeLeftovers.find((l) => l.letter === 'A')!
    const r2 = packJob([piece(32, 23, 1)], [A], opts, new Set(), d1.sheetLetters)
    const c2 = withClient({ ...cutFrom([piece(32, 23, 1)], r2.sheets, 2), id: 'c2' })
    const res = await check(c2, deriveStock([c1, c2]))
    expect(res.overlap).toEqual([])
    expect(res.outside).toEqual([])
    expect(res.count).toBeGreaterThan(20)
  })

  it('crowded sheets with tiny strips, the blade on, at both paper sizes', async () => {
    const ps = [piece(23, 80, 2), piece(8.7, 18, 6), piece(1.6, 18, 2), piece(30, 20, 3), piece(48, 96, 1)]
    const sheets = packJob(ps, [], { ...opts, kerf: 1 / 16 }).sheets
    const cut = withClient({ ...cutFrom(ps, sheets), kerf: 1 / 16 })
    for (const paper of ['A4', 'Letter'] as const) {
      const res = await check(cut, deriveStock([cut]), paper)
      expect(res.overlap).toEqual([])
      expect(res.outside).toEqual([])
    }
  })

  it('60 different jobs on a quarter-inch grid', async () => {
    let seed = 11
    const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296
    for (let k = 0; k < 60; k++) {
      const ps = Array.from({ length: 1 + Math.floor(rnd() * 6) }, (_, i) =>
        piece(Math.round((2 + rnd() * 44) * 4) / 4, Math.round((2 + rnd() * 90) * 4) / 4, 1 + Math.floor(rnd() * 4), `q${i}`),
      )
      const kerf = k % 2 ? 1 / 16 : 0
      const sheets: SheetPlan[] = packJob(ps, [], { ...opts, kerf }).sheets
      const res = await check(withClient({ ...cutFrom(ps, sheets), kerf }))
      expect(res.overlap, `job ${k}`).toEqual([])
      expect(res.outside, `job ${k}`).toEqual([])
    }
  })

  it('carries the client details and the used percentage in the file', async () => {
    const r = packJob([piece(23, 77, 2)], [], opts)
    const cut = withClient(cutFrom([piece(23, 77, 2)], r.sheets))
    const pages = buildPrintPages(cut, deriveStock([cut]), DEFAULT_SETTINGS)
    const text = await (await buildPrintPdf(pages, 'A4', jsPDF, cut)).text()
    for (const needle of ['Asif Ahmad', '0300 1234567', '34/66', 'is used', 'Leftovers kept']) expect(text).toContain(needle)
  })
})

describe('one page per sheet, however many parts', () => {
  const withClient = (cut: CutDoc): CutDoc => ({ ...cut, clientId: 'c', clientName: 'Asif Ahmad', clientPhone: '0300 1234567', sheetNumber: '34/66' })

  async function pdfPages(cut: CutDoc, paper: 'A4' | 'Letter' = 'A4') {
    const pages = buildPrintPages(cut, deriveStock([cut]), DEFAULT_SETTINGS)
    const text = await (await buildPrintPdf(pages, paper, jsPDF, cut)).text()
    return { sheets: pages.length, pdfPages: countPdfPages(text), text }
  }

  it('55 different pieces: every sheet stays on a single page and none is left out', async () => {
    const ps = Array.from({ length: 55 }, (_, i) => piece(2 + (i % 11) * 0.75, 3 + Math.floor(i / 11) * 1.25, 1, `d${i}`))
    const sheets = packJob(ps, [], opts).sheets
    const cut = withClient(cutFrom(ps, sheets))
    for (const paper of ['A4', 'Letter'] as const) {
      const res = await pdfPages(cut, paper)
      expect(res.pdfPages).toBe(res.sheets)
    }
    const boxes: TextBox[] = []
    await buildPrintPdf(buildPrintPages(cut, deriveStock([cut]), DEFAULT_SETTINGS), 'A4', recorder(boxes) as unknown as typeof jsPDF, cut)
    expect(overlaps(boxes)).toEqual([])
    const all = boxes.map((b) => b.text).join('\n')
    for (let n = 1; n <= 55; n++) expect(all).toContain(`Piece ${n}`)
  })

  it('120 identical small pieces still fit one page per sheet', async () => {
    const ps = [piece(3, 3, 120)]
    const sheets = packJob(ps, [], opts).sheets
    const res = await pdfPages(withClient(cutFrom(ps, sheets)))
    expect(res.pdfPages).toBe(res.sheets)
  })

  it('has no cut order anywhere, and lists no leftovers among the parts', async () => {
    const r = packJob([piece(23, 77, 2)], [], opts)
    const cut = withClient(cutFrom([piece(23, 77, 2)], r.sheets))
    const { text } = await pdfPages(cut)
    expect(text.toLowerCase()).not.toContain('cut order')
    expect(text.toLowerCase()).not.toContain('measure each cut')
    expect(text).toContain('CUTTING PIECES')
    expect(text).not.toContain('LEFTOVERS')
  })
})

describe('Print screen pages are the saved PDF pages', () => {
  it('draws the same texts, in the same order, on the same number of pages', async () => {
    const ps = [piece(23, 80, 2), piece(15.5, 20.25, 3), piece(30, 20, 1), piece(1.6, 18, 2)]
    const sheets = packJob(ps, [], { ...opts, kerf: 1 / 16 }).sheets
    const cut: CutDoc = { ...cutFrom(ps, sheets), kerf: 1 / 16, clientName: 'Asif Ahmad', sheetNumber: '34/66' }
    const pages = buildPrintPages(cut, deriveStock([cut]), DEFAULT_SETTINGS)

    const boxes: TextBox[] = []
    await buildPrintPdf(pages, 'A4', recorder(boxes) as unknown as typeof jsPDF, cut)
    const svgs = buildPrintSvgPages(pages, 'A4', jsPDF, cut)

    expect(svgs).toHaveLength(pages.length)
    const unescape = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    const svgTexts = svgs.map((svg) => [...svg.matchAll(/<text [^>]*>([^<]*)<\/text>/g)].map((m) => unescape(m[1])))
    const pdfTexts = pages.map((_, i) => boxes.filter((b) => b.page === i + 1).map((b) => b.text))
    expect(svgTexts).toEqual(pdfTexts)
    for (const svg of svgs) expect(svg.startsWith('<svg')).toBe(true)
  })
})
