import { describe, expect, it } from 'vitest'
import { packJob } from './packer'
import { checkPlan } from './planCheck'
import type { Piece } from './types'

const base = { sheetW: 48, sheetH: 96, kerf: 0.125, minLeftover: 1 }

function rng(seed: number) {
  let s = seed
  return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296
}

// A job that fits one sheet should leave one big leftover a later job can use, not an L-shape of small ones:
// stacking the pieces in one column is always possible, so the plan may never keep less than that.
describe('one sheet: the biggest leftover is kept as big as stacking the pieces in a column leaves it', () => {
  for (const grain of [false, true]) {
    it(`${grain ? 'grain' : 'plain'} sheet, 300 random three-piece jobs`, () => {
      const rnd = rng(11)
      let checked = 0
      for (let i = 0; i < 300; i++) {
        const ps: Piece[] = Array.from({ length: 3 }, (_, j) => ({ id: `p${j}`, w: Math.round(8 + rnd() * 24), h: Math.round(8 + rnd() * 50), qty: 1 }))
        const o = { ...base, grain }
        const r = packJob(ps, [], o)
        expect(checkPlan(ps, r, o)).toEqual([])
        if (r.sheets.length !== 1) continue
        const mw = Math.max(...ps.map((p) => p.w))
        const stacked = ps.reduce((a, p) => a + p.h + base.kerf, 0)
        if (stacked > 96) continue
        const column = Math.max((48 - mw - base.kerf) * 96, 48 * (96 - stacked))
        const got = Math.max(...r.sheets[0].newLeftovers.map((l) => l.w * l.h))
        expect(got, JSON.stringify(ps)).toBeGreaterThanOrEqual(column - 1)
        checked++
      }
      expect(checked).toBeGreaterThan(100)
    })
  }
})
