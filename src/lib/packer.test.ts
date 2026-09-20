import { describe, expect, it } from 'vitest'
import { fmt, fmtLeft, parseInches } from './inches'
import { packJob } from './packer'
import { deriveStock } from './stock'
import type { CutDoc, Piece } from './types'

const opts = { sheetW: 48, sheetH: 96, kerf: 0, minLeftover: 1 }
const piece = (w: number, h: number, qty: number, id = `${w}x${h}`): Piece => ({ id, w, h, qty })

describe('inches', () => {
  it('reads fractions and decimals', () => {
    expect(parseInches('22')).toBe(22)
    expect(parseInches('22.5')).toBe(22.5)
    expect(parseInches('22 1/2')).toBe(22.5)
    expect(parseInches('22-1/2"')).toBe(22.5)
    expect(parseInches('3/8')).toBe(0.375)
    expect(parseInches('abc')).toBeNull()
    expect(parseInches('0')).toBeNull()
    expect(parseInches('')).toBeNull()
  })
  it('shows fractions', () => {
    expect(fmt(22.5)).toBe('22 1/2')
    expect(fmt(0.125)).toBe('1/8')
    expect(fmt(19)).toBe('19')
    expect(fmtLeft(48, 19)).toBe('19 × 48')
  })
})

describe('packJob', () => {
  it('cuts two 23 x 77 pieces from one sheet and keeps 19 x 48 and 2 x 77', () => {
    const r = packJob([piece(23, 77, 2)], [], opts)
    expect(r.unplaced).toHaveLength(0)
    expect(r.sheets).toHaveLength(1)
    const s = r.sheets[0]
    expect(s.isNew).toBe(true)
    expect(s.placements.map((p) => [p.x, p.y, p.w, p.h])).toEqual([
      [0, 0, 23, 77],
      [23, 0, 23, 77],
    ])
    const sizes = s.newLeftovers.map((l) => [l.letter, l.w, l.h])
    expect(sizes).toEqual([
      ['A', 48, 19],
      ['B', 2, 77],
    ])
    expect(s.steps).toEqual(['Cut across at 77 in', 'Cut down at 23 in', 'Cut down at 46 in'])
  })

  it('uses a saved leftover for 19 x 22 and turns the piece only because it must', () => {
    const first = packJob([piece(23, 77, 2)], [], opts)
    const cut: CutDoc = {
      id: 'c1',
      type: 'cut',
      createdAt: 1,
      syncedAt: 1,
      deviceId: 'd1',
      sheets: first.sheets,
    }
    const d = deriveStock([cut])
    expect(d.freeLeftovers).toHaveLength(2)

    const second = packJob([piece(19, 22, 1)], d.freeLeftovers, opts, new Set(), d.sheetLetters)
    expect(second.sheets).toHaveLength(1)
    const s = second.sheets[0]
    expect(s.isNew).toBe(false)
    expect(s.usedLetter).toBe('A')
    expect(s.placements[0].rotated).toBe(true)
    expect([s.placements[0].w, s.placements[0].h]).toEqual([22, 19])
    expect(s.newLeftovers.map((l) => [l.letter, l.w, l.h])).toEqual([['A2', 26, 19]])
    expect(s.steps).toEqual(['Cut down at 22 in'])
  })

  it('does not turn a piece that fits the normal way', () => {
    const r = packJob([piece(20, 60, 1)], [], opts)
    expect(r.sheets[0].placements[0].rotated).toBe(false)
  })

  it('turns a piece that only fits turned', () => {
    const r = packJob([piece(60, 20, 1)], [], opts)
    expect(r.sheets[0].placements[0]).toMatchObject({ rotated: true, w: 20, h: 60 })
  })

  it('reports pieces that never fit', () => {
    const r = packJob([piece(100, 100, 1)], [], opts)
    expect(r.sheets).toHaveLength(0)
    expect(r.unplaced).toHaveLength(1)
  })

  it('needs a second sheet when the first is full', () => {
    const r = packJob([piece(48, 96, 2)], [], opts)
    expect(r.sheets).toHaveLength(2)
  })

  it('adds blade thickness only when asked', () => {
    const r = packJob([piece(23, 40, 2)], [], { ...opts, kerf: 0.125 })
    expect(r.sheets[0].placements[1].x).toBe(23.125)
  })

  it('treats tiny areas as waste', () => {
    const r = packJob([piece(47.5, 95, 1)], [], { ...opts, minLeftover: 1 })
    // 0.5 in strip on the right is waste, 1 in strip at the bottom is kept
    expect(r.sheets[0].newLeftovers.map((l) => [l.w, l.h])).toEqual([[48, 1]])
  })

  it('prefers the smallest leftover that fits', () => {
    const cutA = packJob([piece(30, 40, 1)], [], opts)
    const cutB = packJob([piece(10, 10, 1)], [], opts)
    const docs: CutDoc[] = [
      { id: 'a', type: 'cut', createdAt: 1, syncedAt: 1, deviceId: 'd', sheets: cutA.sheets },
      { id: 'b', type: 'cut', createdAt: 2, syncedAt: 2, deviceId: 'd', sheets: cutB.sheets },
    ]
    const d = deriveStock(docs)
    const r = packJob([piece(5, 5, 1)], d.freeLeftovers, opts, new Set(), d.sheetLetters)
    expect(r.sheets[0].isNew).toBe(false)
    const used = d.freeLeftovers.find((l) => l.id === r.sheets[0].usedLeftoverId)!
    const smallest = [...d.freeLeftovers].sort((x, y) => x.w * x.h - y.w * y.h)[0]
    expect(used.id).toBe(smallest.id)
  })
})

describe('deriveStock', () => {
  const plan = packJob([piece(23, 77, 2)], [], opts)
  const base = (id: string, syncedAt: number | null, sheets = plan.sheets): CutDoc => ({
    id,
    type: 'cut',
    createdAt: syncedAt ?? 99,
    syncedAt,
    deviceId: 'd',
    sheets,
  })

  it('marks the second phone as a conflict when both used the same leftover', () => {
    const a = base('a', 1)
    const leftoverA = a.sheets[0].newLeftovers[0]
    const useIt = (id: string, t: number): CutDoc => {
      const r = packJob(
        [piece(19, 22, 1)],
        deriveStock([a]).freeLeftovers,
        opts,
        new Set(),
        deriveStock([a]).sheetLetters,
      )
      return { id, type: 'cut', createdAt: t, syncedAt: t, deviceId: id, sheets: r.sheets }
    }
    const phone1 = useIt('p1', 10)
    const phone2 = useIt('p2', 20)
    expect(phone1.sheets[0].usedLeftoverId).toBe(leftoverA.id)
    expect(phone2.sheets[0].usedLeftoverId).toBe(leftoverA.id)

    const d = deriveStock([a, phone1, phone2])
    expect(d.conflicts.map((j) => j.cut.id)).toEqual(['p2'])
    // conflicting cut adds no leftovers until answered
    expect(d.freeLeftovers.some((l) => l.createdByCutId === 'p2')).toBe(false)

    const voided = deriveStock([a, phone1, phone2], { p2: 'voided' })
    expect(voided.conflicts).toHaveLength(0)
    expect(voided.freeLeftovers.some((l) => l.createdByCutId === 'p2')).toBe(false)

    const kept = deriveStock([a, phone1, phone2], { p2: 'kept' })
    expect(kept.freeLeftovers.some((l) => l.createdByCutId === 'p2')).toBe(true)
  })

  it('counts a cut that has not synced yet', () => {
    const d = deriveStock([base('a', null)])
    expect(d.freeLeftovers).toHaveLength(2)
  })

  it('removes a leftover with a discard record', () => {
    const a = base('a', 1)
    const gone = a.sheets[0].newLeftovers[0].id
    const d = deriveStock([
      a,
      { id: 'x', type: 'discard', createdAt: 2, syncedAt: 2, deviceId: 'd', sheets: [], discardIds: [gone] },
    ])
    expect(d.freeLeftovers.map((l) => l.id)).not.toContain(gone)
  })
})
