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
})

/** Counts "/Type /Page" (not "/Pages") object entries in the raw PDF body. */
function countPdfPages(pdfText: string): number {
  const matches = pdfText.match(/\/Type\s*\/Page[^s]/g)
  return matches ? matches.length : 0
}
