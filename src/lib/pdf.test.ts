import { jsPDF } from 'jspdf'
import { describe, expect, it } from 'vitest'
import { buildPrintPages } from './print'
import { buildPrintPdf, pdfFileName } from './pdf'
import { packJob } from './packer'
import { deriveStock } from './stock'
import { DEFAULT_SETTINGS } from './types'
import type { CutDoc, Piece } from './types'

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
    expect(name).not.toMatch(/[\\/:*?"<>|]/)
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

  it('uses "{client} - {sheet number}.pdf" when both were typed on New job', () => {
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
    expect(pdfFileName(cut)).toBe('Asif - 34-66.pdf')
  })

  it('falls back to the piece/date name when sheetNumber is missing, even with a client', () => {
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
    expect(pdfFileName(cut)).toBe('Offcut - 23x77 2pcs - 2026-09-21.pdf')
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
