import { describe, expect, it } from 'vitest'
import { buildPrintPages } from './print'
import { packJob } from './packer'
import { deriveStock } from './stock'
import { DEFAULT_SETTINGS } from './types'
import type { CutDoc, Piece } from './types'

const opts = { sheetW: 48, sheetH: 96, kerf: 0, minLeftover: 1 }
const piece = (w: number, h: number, qty: number, id = `${w}x${h}`): Piece => ({ id, w, h, qty })

function cutFrom(pieces: Piece[], sheets: CutDoc['sheets'], kerf = 0): CutDoc {
  return {
    id: 'cut-1',
    type: 'cut',
    createdAt: new Date('2026-09-15T14:30:00').getTime(),
    syncedAt: 1,
    deviceId: 'd1',
    pieces,
    kerf,
    sheets,
  }
}

describe('buildPrintPages', () => {
  it('returns one page per sheet for a 1-sheet job', () => {
    const r = packJob([piece(23, 77, 2)], [], opts)
    const cut = cutFrom([piece(23, 77, 2)], r.sheets)
    const derived = deriveStock([cut])
    const pages = buildPrintPages(cut, derived, DEFAULT_SETTINGS)
    expect(pages).toHaveLength(1)
    expect(pages[0].sheetTotal).toBe(1)
    expect(pages[0].pageNumber).toBe(1)
    expect(pages[0].pageTotal).toBe(1)
  })

  it('returns two pages for a job that needs a second sheet', () => {
    const r = packJob([piece(48, 96, 2)], [], opts)
    expect(r.sheets).toHaveLength(2)
    const cut = cutFrom([piece(48, 96, 2)], r.sheets)
    const derived = deriveStock([cut])
    const pages = buildPrintPages(cut, derived, DEFAULT_SETTINGS)
    expect(pages).toHaveLength(2)
    expect(pages.map((p) => p.pageNumber)).toEqual([1, 2])
    expect(pages.map((p) => p.pageTotal)).toEqual([2, 2])
  })

  it('returns three pages for a mixed leftover + new-sheet 3-sheet job', () => {
    // sheet 1: a leftover-only sheet; sheets 2-3: two more new sheets forced by a big piece.
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
    expect(pages).toHaveLength(3)
  })

  it('a leftover-only job (isNew: false) still produces a page with the right source text', () => {
    const stockPlan = packJob([piece(23, 77, 2)], [], opts)
    const seedCut = cutFrom([piece(23, 77, 2)], stockPlan.sheets)
    const d0 = deriveStock([seedCut])
    const r = packJob([piece(19, 22, 1)], d0.freeLeftovers, opts, new Set(), d0.sheetLetters)
    expect(r.sheets).toHaveLength(1)
    expect(r.sheets[0].isNew).toBe(false)
    const cut = cutFrom([piece(19, 22, 1)], r.sheets)
    const derived = deriveStock([seedCut, cut])
    const pages = buildPrintPages(cut, derived, DEFAULT_SETTINGS)
    expect(pages).toHaveLength(1)
    expect(pages[0].sourceText).toContain('Saved leftover A')
  })

  it('every rectangle on a page has both dimensions in the parts table', () => {
    const r = packJob([piece(23, 77, 2)], [], opts)
    const cut = cutFrom([piece(23, 77, 2)], r.sheets)
    const derived = deriveStock([cut])
    const pages = buildPrintPages(cut, derived, DEFAULT_SETTINGS)
    expect(pages[0].parts.length).toBeGreaterThan(0)
    for (const row of pages[0].parts) {
      expect(row.width).toBeTruthy()
      expect(row.height).toBeTruthy()
    }
  })

  it('header, footer, "Sheet n of N" text are correct', () => {
    const r = packJob([piece(48, 96, 2)], [], opts)
    const cut = cutFrom([piece(48, 96, 2)], r.sheets)
    const derived = deriveStock([cut])
    const pages = buildPrintPages(cut, derived, DEFAULT_SETTINGS)
    expect(pages[0].jobTitle).toContain('48')
    expect(pages[0].footerLeft).toBe('Drawn to scale, not full size. Follow the written sizes.')
    expect(pages[0].sheetIndex).toBe(0)
    expect(pages[0].sheetTotal).toBe(2)
    expect(pages[1].sheetIndex).toBe(1)
  })

  it('blade note reflects kerf-on', () => {
    const r = packJob([piece(23, 40, 2)], [], { ...opts, kerf: 0.125 })
    const cut = cutFrom([piece(23, 40, 2)], r.sheets, 0.125)
    const derived = deriveStock([cut])
    const pages = buildPrintPages(cut, derived, DEFAULT_SETTINGS)
    expect(pages[0].bladeText).toBe('Blade thickness 1/8 in included')
  })

  it('blade note reflects kerf-off', () => {
    const r = packJob([piece(23, 77, 2)], [], opts)
    const cut = cutFrom([piece(23, 77, 2)], r.sheets, 0)
    const derived = deriveStock([cut])
    const pages = buildPrintPages(cut, derived, DEFAULT_SETTINGS)
    expect(pages[0].bladeText).toBe('Blade thickness not included')
  })
})
