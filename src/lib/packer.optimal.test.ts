import { describe, expect, it } from 'vitest'
import { packJob } from './packer'
import { checkPlan } from './planCheck'
import { exactMinSheets, type SizeCount } from './testing/exactSheets'
import type { Piece } from './types'

const opts = { sheetW: 48, sheetH: 96, kerf: 0.125, minLeftover: 1 }
const piece = (id: string, w: number, h: number, qty: number): Piece => ({ id, w, h, qty })

describe('large-job regression fixtures: the plan uses the fewest sheets any layout can', () => {
  // The Ghulam Mustafa job, 28 Oct: 23 pieces, 7 sizes, 0.125 in blade, empty stock. The first report
  // said 6 sheets was too many. The exact search over every edge-to-edge layout (turning allowed, every
  // cut costing a blade) shows 6 is the true minimum, so the test pins both: the plan IS the optimum.
  const ghulam: Piece[] = [
    piece('a', 23.15, 76, 6),
    piece('b', 23.15, 40, 6),
    piece('c', 27.15, 41, 1),
    piece('d', 16, 51, 2),
    piece('e', 16, 25.3, 2),
    piece('f', 21.2, 6.6, 4),
    piece('g', 27.25, 12.15, 2),
  ]
  const asSizes = (ps: Piece[]): SizeCount[] => ps.map((p) => [p.w, p.h, p.qty])

  it('T-19 large multi-sheet job (Ghulam Mustafa job, 28 Oct) packs into the fewest sheets possible', () => {
    const plan = packJob(ghulam, [], opts)
    expect(plan.unplaced).toHaveLength(0)
    expect(checkPlan(ghulam, plan, opts)).toEqual([])
    const best = exactMinSheets(asSizes(ghulam), opts.kerf)
    // Five sheets would be needed for the job to be "efficient"; no layout reaches it.
    expect(best).toBe(6)
    expect(plan.sheets.length).toBe(best)
  })

  it('T-19 the six sheets are five well-filled ones and a nearly empty last one (a big leftover saved)', () => {
    const plan = packJob(ghulam, [], opts)
    const fill = plan.sheets.map((sh) => sh.placements.reduce((a, p) => a + p.w * p.h, 0) / (opts.sheetW * opts.sheetH))
    // The best any layout can do: the last sheet holds just one 16 x 51 piece (17.7%), the other five carry the rest.
    expect(plan.sheets).toHaveLength(6)
    expect(fill[5]).toBeLessThan(0.18)
    expect(Math.min(...fill.slice(0, 5))).toBeGreaterThan(0.8)
    // ...which leaves the last sheet with a big reusable piece (it was 48 x 30 and 5.4 sheets of material before).
    const last = plan.sheets[5]
    expect(Math.max(...last.newLeftovers.map((l) => l.w * l.h))).toBeGreaterThan(48 * 44)
  })

  it('no piece on a later new sheet fits, as typed or turned, into any free space of an earlier sheet (300 random jobs)', () => {
    let s = 31337
    const rnd = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296)
    const q = (x: number) => Math.round(x * 8) / 8
    for (let k = 0; k < 300; k++) {
      const kerf = [0, 0.0625, 0.125][Math.floor(rnd() * 3)]
      const o = { ...opts, kerf, minLeftover: [0.5, 1, 3][Math.floor(rnd() * 3)] }
      const ps = Array.from({ length: 2 + Math.floor(rnd() * 9) }, (_, i) => piece(`p${i}`, q(2 + rnd() * 40), q(2 + rnd() * 85), 1 + Math.floor(rnd() * 3)))
      const plan = packJob(ps, [], o)
      expect(checkPlan(ps, plan, o)).toEqual([])
      plan.sheets.forEach((sh, j) => {
        for (const p of sh.placements) {
          for (let i = 0; i < j; i++) {
            for (const l of plan.sheets[i].newLeftovers) {
              const fitsAsTyped = p.w <= l.w + 1e-6 && p.h <= l.h + 1e-6
              const fitsTurned = p.h <= l.w + 1e-6 && p.w <= l.h + 1e-6
              expect(fitsAsTyped || fitsTurned, `piece ${p.n} on sheet ${j + 1} fits free space ${l.letter} of sheet ${i + 1}`).toBe(false)
            }
          }
        }
      })
    }
  })

  it('a job the first planner needed an extra sheet for: 23 x 33, 23 x 80, 17.4 x 49 and two 17 x 76 take 2 sheets', () => {
    const job = [piece('a', 23, 33, 1), piece('b', 23, 80, 1), piece('c', 17.4, 49, 1), piece('d', 17, 76, 2)]
    expect(packJob(job, [], opts).sheets).toHaveLength(2)
  })

  it('the same job always gives the same layout', () => {
    const shape = (ps: Piece[]) =>
      packJob(ps, [], opts).sheets.map((s) => s.placements.map((p) => `${p.n}:${p.x},${p.y},${p.w}x${p.h}${p.rotated ? 'r' : ''}`).join(' '))
    expect(shape(ghulam)).toEqual(shape(ghulam))
  })

  it('on 150 random small jobs, with or without a blade, the plan is valid and as short as the exact optimum', () => {
    let s = 20261028
    const rnd = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296)
    const q = (x: number) => Math.round(x * 4) / 4
    for (let k = 0; k < 150; k++) {
      const types: SizeCount[] = Array.from({ length: 2 + Math.floor(rnd() * 4) }, () => [q(4 + rnd() * 36), q(4 + rnd() * 80), 1 + Math.floor(rnd() * 3)])
      const kerf = rnd() < 0.7 ? 0.125 : 0
      const ps = types.map(([w, h, c], i) => piece(`p${i}`, w, h, c))
      const o = { ...opts, kerf }
      const plan = packJob(ps, [], o)
      expect(checkPlan(ps, plan, o), JSON.stringify(types)).toEqual([])
      expect(plan.sheets.length, JSON.stringify(types)).toBe(exactMinSheets(types, kerf))
    }
  })
})
