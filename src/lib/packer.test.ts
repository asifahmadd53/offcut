import { describe, expect, it } from 'vitest'
import { fmt, fmtLeft, parseInches } from './inches'
import { packJob } from './packer'
import { deriveStock } from './stock'
import type { CutDoc, Leftover, Piece } from './types'

const opts = { sheetW: 48, sheetH: 96, kerf: 0, minLeftover: 1 }
const piece = (w: number, h: number, qty: number, id = `${w}x${h}`): Piece => ({ id, w, h, qty })

/** A single free leftover, standing in for one entry in derived.freeLeftovers. */
const leftover = (w: number, h: number, id = `lo-${w}x${h}`): Leftover => ({
  id,
  letter: 'A2',
  sheetId: 'sheet-1',
  sheetW: 48,
  sheetH: 96,
  sheetDate: 1,
  createdByCutId: 'cut-1',
  createdAt: 1,
  manual: false,
  status: 'free',
  clientId: 'client-1',
  clientName: 'Test client',
  x: 0,
  y: 0,
  w,
  h,
})

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

  it('fills sheets[0].cuts with structured data paralleling steps for the golden example', () => {
    const r = packJob([piece(23, 77, 2)], [], opts)
    const s = r.sheets[0]
    expect(s.cuts).toEqual([
      { n: 1, kind: 'across', pos: 77, from: 0, to: 48 },
      { n: 2, kind: 'down', pos: 23, from: 0, to: 77 },
      { n: 3, kind: 'down', pos: 46, from: 0, to: 77 },
    ])
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

  it('hiding a job removes it from jobs but keeps its leftovers in stock', () => {
    const a = base('a', 1)
    const withoutHide = deriveStock([a])
    expect(withoutHide.jobs.map((j) => j.cut.id)).toContain('a')
    expect(withoutHide.freeLeftovers).toHaveLength(2)

    const hidden = deriveStock([a], {}, new Set(['a']))
    expect(hidden.jobs.map((j) => j.cut.id)).not.toContain('a')
    // Hiding is a display-only concern: the leftovers this job already saved stay as they are.
    expect(hidden.freeLeftovers).toHaveLength(2)
  })

  it('hiding a conflicting job also removes it from the conflicts list', () => {
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
    expect(phone2.sheets[0].usedLeftoverId).toBe(leftoverA.id)

    const withoutHide = deriveStock([a, phone1, phone2])
    expect(withoutHide.conflicts.map((j) => j.cut.id)).toEqual(['p2'])

    const hidden = deriveStock([a, phone1, phone2], {}, new Set(['p2']))
    expect(hidden.conflicts).toHaveLength(0)
  })

  it('T-18 same records in different order give identical stock', () => {
    // Stock must never depend on the order records arrive in: two phones syncing in a
    // different sequence must still end up looking at the same workshop inventory.
    const a = base('a', 1)
    const b = base('b', 2, packJob([piece(10, 10, 1)], [], opts).sheets)
    const discard: CutDoc = {
      id: 'x',
      type: 'discard',
      createdAt: 3,
      syncedAt: 3,
      deviceId: 'd',
      sheets: [],
      discardIds: [a.sheets[0].newLeftovers[1].id],
    }

    const forward = deriveStock([a, b, discard])
    const backward = deriveStock([discard, b, a])
    const shuffled = deriveStock([b, discard, a])

    const ids = (d: ReturnType<typeof deriveStock>) =>
      [...d.freeLeftovers.map((l) => l.id)].sort()

    expect(ids(backward)).toEqual(ids(forward))
    expect(ids(shuffled)).toEqual(ids(forward))
    expect(backward.jobs.map((j) => j.cut.id).sort()).toEqual(
      forward.jobs.map((j) => j.cut.id).sort(),
    )
  })

  it('deriveStock marks a job "missing" when its used leftover was never recorded on this phone', () => {
    // Happens when a phone syncs a cut that references a leftover it has never heard of,
    // for example a record made before this device existed. Same two answers as "taken".
    const phantom: CutDoc = {
      id: 'p',
      type: 'cut',
      createdAt: 5,
      syncedAt: 5,
      deviceId: 'd',
      sheets: [
        {
          sheetId: 'ghost-sheet',
          sheetW: 48,
          sheetH: 96,
          sheetDate: 5,
          isNew: false,
          usedLeftoverId: 'never-existed',
          usedLetter: 'A',
          region: { x: 0, y: 0, w: 19, h: 22 },
          placements: [],
          newLeftovers: [],
          steps: [],
        },
      ],
    }
    const d = deriveStock([phantom])
    expect(d.conflicts).toHaveLength(1)
    expect(d.conflicts[0].conflict?.kind).toBe('missing')
    expect(d.freeLeftovers).toHaveLength(0)

    const kept = deriveStock([phantom], { p: 'kept' })
    expect(kept.conflicts).toHaveLength(0)
    expect(kept.jobs.find((j) => j.cut.id === 'p')?.status).toBe('kept')
  })
})

describe('packJob edge cases', () => {
  it('a piece exactly equal to a leftover uses the whole leftover and keeps no remainder', () => {
    // Leftover A from the owner's golden example is 48 x 19. A piece of exactly that
    // size should consume it completely: no sliver left over on either side.
    const first = packJob([piece(23, 77, 2)], [], opts)
    const d = deriveStock([
      { id: 'a', type: 'cut', createdAt: 1, syncedAt: 1, deviceId: 'd', sheets: first.sheets },
    ])
    const leftoverA = d.freeLeftovers.find((l) => l.letter === 'A')!
    expect([leftoverA.w, leftoverA.h]).toEqual([48, 19])

    const second = packJob([piece(48, 19, 1)], d.freeLeftovers, opts, new Set(), d.sheetLetters)
    expect(second.sheets).toHaveLength(1)
    expect(second.sheets[0].isNew).toBe(false)
    expect(second.sheets[0].usedLeftoverId).toBe(leftoverA.id)
    expect(second.sheets[0].newLeftovers).toHaveLength(0)
    expect(second.unplaced).toHaveLength(0)
  })

  it('kerf is also removed when placing into a saved leftover', () => {
    const first = packJob([piece(23, 77, 2)], [], opts)
    const d = deriveStock([
      { id: 'a', type: 'cut', createdAt: 1, syncedAt: 1, deviceId: 'd', sheets: first.sheets },
    ])
    // Leftover A is 48 x 19; two 23-wide pieces need a kerf gap between them.
    const withKerf = { ...opts, kerf: 0.125 }
    const second = packJob(
      [piece(23, 10, 2)],
      d.freeLeftovers,
      withKerf,
      new Set(),
      d.sheetLetters,
    )
    expect(second.sheets[0].isNew).toBe(false)
    const [p1, p2] = second.sheets[0].placements
    expect(p2.x - p1.x).toBe(23.125)
  })

  it('plans across several sheets when leftovers only cover part of a job', () => {
    // One small leftover plus a job that needs much more area: the leftover is used
    // first, then a fresh sheet is opened for the rest, per R2 (leftover always tried
    // first) without forcing everything onto new sheets.
    const stockPlan = packJob([piece(10, 10, 1)], [], opts)
    const d = deriveStock([
      { id: 'a', type: 'cut', createdAt: 1, syncedAt: 1, deviceId: 'd', sheets: stockPlan.sheets },
    ])
    const result = packJob(
      [piece(10, 10, 1), piece(48, 96, 1)],
      d.freeLeftovers,
      opts,
      new Set(),
      d.sheetLetters,
    )
    expect(result.sheets.length).toBeGreaterThanOrEqual(2)
    expect(result.sheets.some((s) => !s.isNew)).toBe(true)
    expect(result.sheets.some((s) => s.isNew)).toBe(true)
    expect(result.unplaced).toHaveLength(0)
  })

  it('excludedIds removes a leftover from consideration and forces a new sheet', () => {
    const first = packJob([piece(23, 77, 2)], [], opts)
    const d = deriveStock([
      { id: 'a', type: 'cut', createdAt: 1, syncedAt: 1, deviceId: 'd', sheets: first.sheets },
    ])
    const leftoverA = d.freeLeftovers.find((l) => l.letter === 'A')!

    const excluded = packJob(
      [piece(19, 22, 1)],
      d.freeLeftovers,
      opts,
      new Set([leftoverA.id]),
      d.sheetLetters,
    )
    expect(excluded.sheets[0].isNew).toBe(true)
    expect(excluded.sheets[0].usedLeftoverId).toBeUndefined()
  })

  it('letters stay unique across two jobs cut from the same physical sheet', () => {
    const first = packJob([piece(23, 77, 2)], [], opts)
    const cut1: CutDoc = {
      id: 'a',
      type: 'cut',
      createdAt: 1,
      syncedAt: 1,
      deviceId: 'd',
      sheets: first.sheets,
    }
    const d1 = deriveStock([cut1])
    // Use leftover A (48 x 19), leaving A2 on the same physical sheet.
    const second = packJob([piece(19, 10, 1)], d1.freeLeftovers, opts, new Set(), d1.sheetLetters)
    expect(second.sheets[0].newLeftovers.every((l) => l.letter !== 'A')).toBe(true)

    const cut2: CutDoc = {
      id: 'b',
      type: 'cut',
      createdAt: 2,
      syncedAt: 2,
      deviceId: 'd',
      sheets: second.sheets,
    }
    const d2 = deriveStock([cut1, cut2])
    const lettersOnSheet = d2.leftovers
      .filter((l) => l.sheetId === first.sheets[0].sheetId)
      .map((l) => l.letter)
    // No letter may repeat on the one physical sheet, no matter how many jobs touched it.
    expect(new Set(lettersOnSheet).size).toBe(lettersOnSheet.length)
  })
})

describe('packJob allowNewSheets (leftover-restricted planning)', () => {
  it('T-19 a 30 x 48 piece does not fit a 28 x 48 leftover with allowNewSheets false: unplaced, no new sheet', () => {
    const lo = leftover(28, 48)
    const result = packJob(
      [piece(30, 48, 1)],
      [lo],
      { ...opts, allowNewSheets: false },
      new Set(),
      new Map(),
    )
    expect(result.sheets).toHaveLength(0)
    expect(result.unplaced).toHaveLength(1)
    expect(result.unplaced[0].label).toBe('30 × 48')
  })

  it('T-20 a 48 x 28 piece fits a 28 x 48 leftover only when turned, rotated = true', () => {
    const lo = leftover(28, 48)
    const result = packJob(
      [piece(48, 28, 1)],
      [lo],
      { ...opts, allowNewSheets: false },
      new Set(),
      new Map(),
    )
    expect(result.unplaced).toHaveLength(0)
    expect(result.sheets).toHaveLength(1)
    expect(result.sheets[0].placements[0].rotated).toBe(true)
  })

  it('T-21 a piece that fits unturned is never turned, even with allowNewSheets false', () => {
    const lo = leftover(28, 48)
    const result = packJob(
      [piece(28, 40, 1)],
      [lo],
      { ...opts, allowNewSheets: false },
      new Set(),
      new Map(),
    )
    expect(result.unplaced).toHaveLength(0)
    expect(result.sheets[0].placements[0].rotated).toBe(false)
  })

  it('T-22 of two pieces only one fits the leftover: one placed, one left unplaced', () => {
    const lo = leftover(28, 48)
    const result = packJob(
      [piece(20, 40, 1, 'fits'), piece(30, 48, 1, 'too-big')],
      [lo],
      { ...opts, allowNewSheets: false },
      new Set(),
      new Map(),
    )
    expect(result.sheets).toHaveLength(1)
    expect(result.sheets[0].placements).toHaveLength(1)
    expect(result.sheets[0].placements[0].pieceId).toBe('fits')
    expect(result.unplaced).toHaveLength(1)
    expect(result.unplaced[0].pieceId).toBe('too-big')
  })

  it('T-23 the same job with allowNewSheets true (default) fills the leftover plus a new sheet', () => {
    const lo = leftover(28, 48)
    const result = packJob(
      [piece(20, 40, 1, 'fits'), piece(30, 48, 1, 'too-big')],
      [lo],
      opts,
      new Set(),
      new Map(),
    )
    expect(result.unplaced).toHaveLength(0)
    expect(result.sheets).toHaveLength(2)
    expect(result.sheets.some((s) => !s.isNew)).toBe(true)
    expect(result.sheets.some((s) => s.isNew)).toBe(true)
  })
})
