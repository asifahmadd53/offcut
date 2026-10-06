import { describe, expect, it } from 'vitest'
import { buildPrintPages } from './print'
import { packJob } from './packer'
import { buildBlocks } from './sheetView'
import { deriveStock } from './stock'
import { partSections } from './pdf'
import { cleanTape, describeSides, hasTape, rotateTape, tapeLengths, tapeSummary, tapeTotal } from './tape'
import { DEFAULT_SETTINGS } from './types'
import type { CutDoc, Piece } from './types'

const opts = { sheetW: 48, sheetH: 96, kerf: 0, minLeftover: 1 }

describe('edge tape helpers', () => {
  it('stores only the sides that are on', () => {
    expect(cleanTape({ top: true, left: false })).toEqual({ top: true })
    expect(cleanTape({ top: false })).toBeUndefined()
    expect(cleanTape({})).toBeUndefined()
    expect(hasTape({ bottom: true })).toBe(true)
  })

  it('a quarter turn clockwise moves top→right→bottom→left→top, and four turns come back', () => {
    expect(rotateTape({ top: true })).toEqual({ right: true })
    expect(rotateTape({ right: true })).toEqual({ bottom: true })
    expect(rotateTape({ bottom: true })).toEqual({ left: true })
    expect(rotateTape({ left: true })).toEqual({ top: true })
    const all = { top: true, left: true }
    expect(rotateTape(rotateTape(rotateTape(rotateTape(all))))).toEqual(all)
    expect(rotateTape({})).toBeUndefined()
  })

  it('measures the taped sides: top/bottom run along the width, left/right along the height', () => {
    expect(tapeLengths(10.5, 38.6, { top: true, left: true })).toEqual([10.5, 38.6])
    expect(tapeTotal(10.5, 38.6, { top: true, bottom: true, left: true, right: true })).toBeCloseTo(2 * 10.5 + 2 * 38.6)
    expect(describeSides({ top: true, left: true })).toBe('top, left')
    expect(describeSides({ top: true, right: true, bottom: true, left: true })).toBe('all 4 sides')
  })

  it('totals a sheet in piece order', () => {
    const s = tapeSummary([
      { n: 2, w: 4, h: 10, tape: { top: true } },
      { n: 1, w: 5, h: 5 },
      { n: 3, w: 6, h: 8, tape: { left: true, right: true } },
    ])
    expect(s.rows.map((r) => r.n)).toEqual([2, 3])
    expect(s.total).toBe(4 + 16)
  })
})

describe('edge tape through the plan', () => {
  const piece = (w: number, h: number, tape: Piece['tape']): Piece => ({ id: `${w}x${h}`, w, h, qty: 1, tape })

  it('travels with a piece onto the sheet and turns with it when the plan turns the piece', () => {
    const upright = packJob([piece(20, 50, { top: true, left: true })], [], opts).sheets[0].placements[0]
    expect(upright.rotated).toBe(false)
    expect(upright.tape).toEqual({ top: true, left: true })

    // 50 wide does not fit the 48-wide sheet, so the plan has to turn it.
    const turned = packJob([piece(50, 20, { top: true, left: true })], [], opts).sheets[0].placements[0]
    expect(turned.rotated).toBe(true)
    expect(turned.tape).toEqual({ right: true, top: true })
  })

  it('does not change where anything is placed', () => {
    const plain = packJob([piece(20, 50, undefined), piece(10, 10, undefined)], [], opts)
    const taped = packJob([piece(20, 50, { top: true }), piece(10, 10, { left: true, right: true })], [], opts)
    expect(taped.sheets[0].placements.map(({ x, y, w, h }) => [x, y, w, h])).toEqual(plain.sheets[0].placements.map(({ x, y, w, h }) => [x, y, w, h]))
  })

  it('reaches the drawing blocks but not the PDF parts list', () => {
    const ps = [piece(20, 50, { top: true, left: true })]
    const sheets = packJob(ps, [], opts).sheets
    const cut: CutDoc = { id: 'c', type: 'cut', createdAt: 1, syncedAt: 1, deviceId: 'd', pieces: ps, kerf: 0, sheets }
    const derived = deriveStock([cut])
    const blocks = buildBlocks(sheets[0], derived, cut.id)
    expect(blocks.find((b) => b.kind === 'cut')?.tape).toEqual({ top: true, left: true })
    const page = buildPrintPages(cut, derived, DEFAULT_SETTINGS)[0]
    const sections = partSections(page.blocks)
    expect(sections.map((s) => s.title)).toEqual(['Cutting pieces'])
  })
})
