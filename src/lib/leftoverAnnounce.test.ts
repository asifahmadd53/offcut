import { describe, expect, it } from 'vitest'
import { dayMonth } from './format'
import { packJob } from './packer'
import { deriveStock } from './stock'
import { forcedNewSheetNote, leftoverUseMessage, usingLeftoverToast, wouldUseLeftover } from './leftoverAnnounce'
import type { CutDoc, Leftover, Piece } from './types'

const opts = { sheetW: 48, sheetH: 96, kerf: 0, minLeftover: 1 }
const piece = (w: number, h: number, qty: number, id = `${w}x${h}`): Piece => ({ id, w, h, qty })

const leftover = (w: number, h: number, id = `lo-${w}x${h}`, letter = 'A2'): Leftover => ({
  id,
  letter,
  sheetId: 'sheet-1',
  sheetW: 48,
  sheetH: 96,
  sheetDate: 1,
  createdByCutId: 'cut-1',
  createdAt: 1,
  manual: false,
  status: 'free',
  x: 0,
  y: 0,
  w,
  h,
})

/** Golden example 1's stock: leftover A (48 x 19) and B (2 x 77), from an empty sheet. */
function goldenStock() {
  const first = packJob([piece(23, 77, 2)], [], opts)
  const d = deriveStock([
    { id: 'a', type: 'cut', createdAt: 1, syncedAt: 1, deviceId: 'd', sheets: first.sheets },
  ] as CutDoc[])
  return d
}

describe('wouldUseLeftover', () => {
  it('a normal default plan that fits a leftover uses it, without opening a new sheet', () => {
    const d = goldenStock()
    const used = wouldUseLeftover([piece(19, 22, 1)], d.freeLeftovers, opts)
    expect(used).toHaveLength(1)
    expect(used[0].letter).toBe('A')
  })

  it('returns an empty list when nothing in stock fits', () => {
    const stock = [leftover(5, 5)]
    const used = wouldUseLeftover([piece(23, 77, 1)], stock, opts)
    expect(used).toHaveLength(0)
  })

  it('reports a leftover that only fits when the piece is turned', () => {
    const stock = [leftover(28, 48)]
    const used = wouldUseLeftover([piece(48, 28, 1)], stock, opts)
    expect(used).toHaveLength(1)
    expect(used[0].w * used[0].h).toBe(28 * 48)
  })
})

describe('leftoverUseMessage', () => {
  it('single leftover, single piece: exact wording per spec', () => {
    const d = goldenStock()
    const leftoverA = d.freeLeftovers.find((l) => l.letter === 'A')!
    const result = packJob([piece(19, 22, 1)], d.freeLeftovers, opts, new Set(), d.sheetLetters)
    const msg = leftoverUseMessage(result.sheets, [piece(19, 22, 1)])
    expect(msg).not.toBeNull()
    expect(msg!.title).toBe('You had a leftover, so I used it')
    expect(msg!.body).toBe(
      `Your 19 × 22 piece fits in saved leftover A (19 × 48) from the ${dayMonth(leftoverA.sheetDate)} sheet. No new sheet needed. You saved 1 sheet.`,
    )
  })

  it('mixed plan (leftover + new sheet): exact wording per spec', () => {
    const stock = [leftover(19, 48, 'lo-a', 'A')]
    const pieces = [piece(19, 22, 2, 'fits'), piece(30, 48, 1, 'too-big')]
    const result = packJob(pieces, stock, opts)
    const msg = leftoverUseMessage(result.sheets, pieces)
    expect(msg).not.toBeNull()
    expect(msg!.title).toBe('Part of this job fits in your leftovers')
    expect(msg!.body).toBe('2 pieces fit in leftover A (19 × 48). 1 piece needs a new sheet.')
  })

  it('several leftovers used: each listed on its own line', () => {
    const stock = [leftover(10, 10, 'lo-a', 'A'), leftover(10, 10, 'lo-b', 'B')]
    const pieces = [piece(10, 10, 1, 'p1'), piece(10, 10, 1, 'p2')]
    const result = packJob(pieces, stock, opts)
    const msg = leftoverUseMessage(result.sheets, pieces)
    expect(msg).not.toBeNull()
    expect(msg!.body).toContain('A (10 × 10)')
    expect(msg!.body).toContain('B (10 × 10)')
    expect(msg!.body.split('\n')).toHaveLength(4) // "fit in...:" + A line + B line + "No new sheet..."
  })

  it('no leftover used at all: returns null', () => {
    const pieces = [piece(23, 77, 1)]
    const result = packJob(pieces, [], opts)
    expect(leftoverUseMessage(result.sheets, pieces)).toBeNull()
  })
})

describe('usingLeftoverToast', () => {
  it('names the first leftover used', () => {
    expect(
      usingLeftoverToast([{ id: '1', letter: 'A', w: 19, h: 48, sheetDate: 1 }]),
    ).toBe('Using leftover A (19 × 48)')
  })
  it('is null when nothing was used', () => {
    expect(usingLeftoverToast([])).toBeNull()
  })
})

describe('forcedNewSheetNote', () => {
  it('names the leftover that could have been used', () => {
    expect(
      forcedNewSheetNote([{ id: '1', letter: 'A', w: 19, h: 48, sheetDate: 1 }]),
    ).toBe('You chose a new sheet. Leftover A (19 × 48) could have held this.')
  })
  it('is null when nothing would have fit', () => {
    expect(forcedNewSheetNote([])).toBeNull()
  })
})

describe('forceNewSheet plan (empty stock passed to packJob)', () => {
  it('a job that would use a leftover produces only new sheets when planned with empty stock', () => {
    const d = goldenStock()
    const forced = packJob([piece(19, 22, 1)], [], opts, new Set(), d.sheetLetters)
    expect(forced.sheets.every((s) => s.isNew)).toBe(true)
    expect(forced.unplaced).toHaveLength(0)
  })

  it('confirming a forced-new-sheet plan leaves the leftover that would have fit still free', () => {
    // Recreate the golden stock as an actual first record (not just its derived view),
    // so a second confirmed cut can be layered on top of it.
    const first = packJob([piece(23, 77, 2)], [], opts)
    const cut1: CutDoc = { id: 'a', type: 'cut', createdAt: 1, syncedAt: 1, deviceId: 'd', sheets: first.sheets }
    const d1 = deriveStock([cut1])

    // Forced plan: empty stock, so it never touches leftover A even though A would fit.
    const forced = packJob([piece(19, 22, 1)], [], opts, new Set(), d1.sheetLetters)
    expect(forced.sheets.every((s) => s.isNew)).toBe(true)

    const cut2: CutDoc = { id: 'b', type: 'cut', createdAt: 2, syncedAt: 2, deviceId: 'd', sheets: forced.sheets }
    const d2 = deriveStock([cut1, cut2])
    expect(d2.freeLeftovers.some((l) => l.letter === 'A')).toBe(true)
  })
})
