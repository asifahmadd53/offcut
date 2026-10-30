import { describe, expect, it } from 'vitest'
import { packJob } from './packer'
import { checkPlan } from './planCheck'
import { deriveStock } from './stock'
import { exactMinSheets, type SizeCount } from './testing/exactSheets'
import { UNASSIGNED_CLIENT_ID, UNASSIGNED_CLIENT_NAME, type CutDoc, type Piece } from './types'

const base = { sheetW: 48, sheetH: 96, kerf: 0.125, minLeftover: 1 }
const piece = (id: string, w: number, h: number, qty: number): Piece => ({ id, w, h, qty })

function rng(seed: number) {
  let s = seed
  return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296
}

const cutFrom = (id: string, pieces: Piece[], sheets: CutDoc['sheets'], at: number): CutDoc => ({
  id,
  type: 'cut',
  createdAt: at,
  syncedAt: at,
  deviceId: 'd',
  pieces,
  kerf: base.kerf,
  sheets,
  clientId: UNASSIGNED_CLIENT_ID,
  clientName: UNASSIGNED_CLIENT_NAME,
})

describe('grain: a grained sheet never turns a piece', () => {
  // Pieces that only fit a sheet when turned, so the difference between the two modes is visible.
  const wide = [piece('a', 60, 20, 1), piece('b', 40, 10, 2)]

  it('without grain a piece that is too wide is turned to fit', () => {
    const r = packJob(wide, [], base)
    expect(r.unplaced).toHaveLength(0)
    expect(r.sheets.flatMap((s) => s.placements).some((p) => p.rotated)).toBe(true)
  })

  it('with grain the same piece is left out (not turned), and nothing else is turned', () => {
    const r = packJob(wide, [], { ...base, grain: true })
    expect(r.unplaced.map((u) => u.n)).toEqual([1])
    expect(r.sheets.every((s) => s.grain === true)).toBe(true)
    expect(r.sheets.flatMap((s) => s.placements).every((p) => !p.rotated)).toBe(true)
    expect(checkPlan(wide, r, { ...base, grain: true })).toEqual([])
  })

  it('the default is untouched: a plain job gives exactly the plan it gave before grain existed', () => {
    const ps = [piece('a', 23, 77, 2)]
    const plain = packJob(ps, [], { ...base, kerf: 0 })
    expect(plain.sheets[0].grain).toBeUndefined()
    // The golden example: two 23 x 77 pieces keep a 19 x 48 strip and a 2 x 77 strip.
    expect(plain.sheets[0].newLeftovers.map((l) => `${l.w}x${l.h}`).sort()).toEqual(['2x77', '48x19'])
  })

  it('300 random jobs with grain: nothing is ever turned, every piece is placed or reported, and the plan is sound', () => {
    const rnd = rng(8080)
    const q = (x: number) => Math.round(x * 8) / 8
    for (let k = 0; k < 300; k++) {
      const o = { ...base, kerf: [0, 0.125][Math.floor(rnd() * 2)], grain: true }
      const ps = Array.from({ length: 2 + Math.floor(rnd() * 8) }, (_, i) => piece(`p${i}`, q(2 + rnd() * 45), q(2 + rnd() * 94), 1 + Math.floor(rnd() * 3)))
      const r = packJob(ps, [], o)
      expect(checkPlan(ps, r, o), JSON.stringify(ps)).toEqual([])
      expect(r.sheets.flatMap((s) => s.placements).every((p) => !p.rotated)).toBe(true)
    }
  })

  it('with grain the fewest sheets is still found: it equals the exact optimum when nothing may be turned', () => {
    const rnd = rng(31)
    const q = (x: number) => Math.round(x * 4) / 4
    for (let k = 0; k < 80; k++) {
      const types: SizeCount[] = Array.from({ length: 2 + Math.floor(rnd() * 4) }, () => [q(4 + rnd() * 36), q(4 + rnd() * 80), 1 + Math.floor(rnd() * 3)])
      const kerf = rnd() < 0.7 ? 0.125 : 0
      const ps = types.map(([w, h, c], i) => piece(`p${i}`, w, h, c))
      const o = { ...base, kerf, grain: true }
      const r = packJob(ps, [], o)
      expect(checkPlan(ps, r, o)).toEqual([])
      expect(r.unplaced).toHaveLength(0)
      expect(r.sheets.length, JSON.stringify(types)).toBe(exactMinSheets(types, kerf, 48, 96, true))
    }
  })
})

describe('grain: leftovers are kept, remembered and reused', () => {
  it('what is left of a grained sheet carries the grain into the stock', () => {
    const ps = [piece('a', 20, 50, 1)]
    const r = packJob(ps, [], { ...base, grain: true })
    const d = deriveStock([cutFrom('c1', ps, r.sheets, 1)])
    expect(d.freeLeftovers.length).toBeGreaterThan(0)
    expect(d.freeLeftovers.every((l) => l.grain === true)).toBe(true)
  })

  it('a later job uses the grained leftover first and does not turn a piece in it, even if the job itself has no grain', () => {
    const first = [piece('a', 20, 50, 1)]
    const r1 = packJob(first, [], { ...base, grain: true })
    const d = deriveStock([cutFrom('c1', first, r1.sheets, 1)])
    // A 40-tall by 20-wide leftover would take this piece only if it is turned; it is a grained leftover, so it must not be.
    const second = [piece('b', 45, 20, 1)]
    const r2 = packJob(second, d.freeLeftovers, base, new Set(), d.sheetLetters)
    expect(r2.unplaced).toHaveLength(0)
    for (const s of r2.sheets) {
      if (!s.isNew && s.grain) expect(s.placements.every((p) => !p.rotated)).toBe(true)
    }
    expect(checkPlan(second, r2, base)).toEqual([])
  })

  it('a grained job reuses leftovers and never leaves one a piece fits (as typed) unused, over chains of jobs', () => {
    const rnd = rng(5)
    const q = (x: number) => Math.round(x * 8) / 8
    for (let k = 0; k < 60; k++) {
      const o = { ...base, kerf: [0, 0.125][Math.floor(rnd() * 2)], grain: true }
      const cuts: CutDoc[] = []
      for (let round = 0; round < 4; round++) {
        const d = deriveStock(cuts)
        const ps = Array.from({ length: 1 + Math.floor(rnd() * 6) }, (_, i) => piece(`p${i}`, q(2 + rnd() * 30), q(2 + rnd() * 60), 1 + Math.floor(rnd() * 3)))
        const r = packJob(ps, d.freeLeftovers, o, new Set(), d.sheetLetters)
        expect(checkPlan(ps, r, o), JSON.stringify(ps)).toEqual([])
        // R2: a piece on a new sheet never fits, as typed, a saved leftover that this plan did not use up.
        const usedIds = new Set(r.sheets.filter((s) => !s.isNew).map((s) => s.usedLeftoverId))
        for (const s of r.sheets.filter((x) => x.isNew)) {
          for (const p of s.placements) {
            const lo = d.freeLeftovers.find((l) => !usedIds.has(l.id) && p.w <= l.w && p.h <= l.h)
            expect(lo, `piece ${p.n} went on a new sheet beside a free ${lo?.w} × ${lo?.h}`).toBeUndefined()
          }
        }
        cuts.push(cutFrom(`c${k}-${round}`, ps, r.sheets, round + 1))
      }
    }
  })
})

describe('a leftover that fits a piece only turned is still used (when turning is allowed)', () => {
  const first = [piece('big', 48, 91, 1)] // leaves a 48 x 4.875 strip at the bottom
  const stockFor = () => {
    const r = packJob(first, [], { ...base, kerf: 0 })
    return deriveStock([cutFrom('c1', first, r.sheets, 1)])
  }

  it('a 5 x 41 piece goes into the 48 x 5 leftover turned, not on a new sheet beside it', () => {
    const d = stockFor()
    const leftover = d.freeLeftovers.find((l) => l.w === 48 && Math.abs(l.h - 5) < 0.01)
    expect(leftover).toBeDefined()
    const job = [piece('a', 30, 50, 1), piece('b', 5, 41, 1)]
    const r = packJob(job, d.freeLeftovers, { ...base, kerf: 0 }, new Set(), d.sheetLetters)
    expect(checkPlan(job, r, { ...base, kerf: 0 })).toEqual([])
    const used = r.sheets.filter((s) => !s.isNew)
    expect(used).toHaveLength(1)
    expect(used[0].placements[0].pieceId).toBe('b')
    expect(used[0].placements[0].rotated).toBe(true)
  })

  it('with grain the same piece is NOT turned, so the leftover stays free and the piece takes a new sheet', () => {
    const d = stockFor()
    const job = [piece('a', 30, 50, 1), piece('b', 5, 41, 1)]
    const o = { ...base, kerf: 0, grain: true }
    const r = packJob(job, d.freeLeftovers, o, new Set(), d.sheetLetters)
    expect(checkPlan(job, r, o)).toEqual([])
    expect(r.sheets.filter((s) => !s.isNew)).toHaveLength(0)
    expect(r.sheets.flatMap((s) => s.placements).every((p) => !p.rotated)).toBe(true)
  })
})
