import { describe, expect, it } from 'vitest'
import { buildBlocks } from './sheetView'
import { packJob } from './packer'
import { deriveStock } from './stock'
import type { CutDoc, Piece } from './types'

const opts = { sheetW: 48, sheetH: 96, kerf: 0, minLeftover: 1 }
const piece = (w: number, h: number, qty: number, id = `${w}x${h}`): Piece => ({ id, w, h, qty })

describe('buildBlocks', () => {
  it('golden example 1 (23 x 77 x 2): two cut blocks and two free leftovers, matching SRS screen 4', () => {
    const result = packJob([piece(23, 77, 2)], [], opts)
    const sheet = result.sheets[0]
    const d = deriveStock([]) // no records yet: sheet has not been confirmed, so nothing "earlier"
    const blocks = buildBlocks(sheet, d)

    const cutBlocks = blocks.filter((b) => b.kind === 'cut')
    const freeBlocks = blocks.filter((b) => b.kind === 'freeNew')
    const earlierBlocks = blocks.filter((b) => b.kind === 'earlier')

    expect(cutBlocks).toHaveLength(2)
    expect(cutBlocks.map((b) => [b.x, b.y, b.w, b.h])).toEqual([
      [0, 0, 23, 77],
      [23, 0, 23, 77],
    ])
    expect(earlierBlocks).toHaveLength(0)

    // Leftover A (48 x 19, bottom strip) and B (2 x 77, right sliver)
    expect(freeBlocks.map((b) => [b.letter, b.w, b.h])).toEqual([
      ['A', 48, 19],
      ['B', 2, 77],
    ])
  })

  it('reuse plan (19 x 22 into leftover A): shows the two earlier pieces as "earlier" and the new piece as "cut"', () => {
    const first = packJob([piece(23, 77, 2)], [], opts)
    const cut: CutDoc = {
      id: 'c1',
      type: 'cut',
      createdAt: 1,
      syncedAt: 1,
      deviceId: 'd1',
      sheets: first.sheets,
    }
    const d1 = deriveStock([cut])
    const second = packJob([piece(19, 22, 1)], d1.freeLeftovers, opts, new Set(), d1.sheetLetters)

    // Confirm the second cut so the full history exists, then build blocks as the Plan
    // screen would while the second plan is still unconfirmed (selfCutId excludes it).
    const blocks = buildBlocks(second.sheets[0], d1)

    const earlier = blocks.filter((b) => b.kind === 'earlier')
    const cut2 = blocks.filter((b) => b.kind === 'cut')
    const freeNew = blocks.filter((b) => b.kind === 'freeNew')

    expect(earlier).toHaveLength(2) // the two 23x77 pieces cut earlier
    expect(cut2).toHaveLength(1)
    expect(cut2[0].rotated).toBe(true)
    expect(freeNew.map((b) => [b.letter, b.w, b.h])).toEqual([['A2', 26, 19]])
  })
})
