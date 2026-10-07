import { describe, expect, it } from 'vitest'
import { packJob } from './packer'
import { checkPlan } from './planCheck'
import { deriveStock } from './stock'
import type { CutDoc, Piece } from './types'
import { UNASSIGNED_CLIENT_ID, UNASSIGNED_CLIENT_NAME } from './types'

function rng(seed: number) {
  let s = seed
  return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296
}
const quarter = (x: number) => Math.round(x * 4) / 4

function randomPieces(rnd: () => number, maxW: number, maxH: number): Piece[] {
  return Array.from({ length: 1 + Math.floor(rnd() * 9) }, (_, i) => ({
    id: 'p' + i,
    w: quarter(1 + rnd() * (maxW - 1)),
    h: quarter(1 + rnd() * (maxH - 1)),
    qty: 1 + Math.floor(rnd() * 3),
  }))
}

describe('checkPlan audits every plan', () => {
  it('finds nothing wrong in 600 random jobs on fresh sheets, blade on or off', () => {
    const rnd = rng(11)
    for (let k = 0; k < 600; k++) {
      const pieces = randomPieces(rnd, 50, 98)
      const opts = { sheetW: 48, sheetH: 96, kerf: rnd() < 0.5 ? 0.125 : 0, minLeftover: 1 }
      const r = packJob(pieces, [], opts)
      expect(checkPlan(pieces, r, opts), JSON.stringify(pieces)).toEqual([])
    }
  })

  it('finds nothing wrong when a second job is cut from the first job’s saved leftovers, again and again', () => {
    const rnd = rng(23)
    for (let k = 0; k < 150; k++) {
      const opts = { sheetW: 48, sheetH: 96, kerf: rnd() < 0.5 ? 0.125 : 0, minLeftover: 1 }
      const cuts: CutDoc[] = []
      for (let round = 0; round < 4; round++) {
        const derived = deriveStock(cuts)
        const pieces = randomPieces(rnd, 30, 60)
        const r = packJob(pieces, derived.freeLeftovers, opts, new Set(), derived.sheetLetters)
        expect(checkPlan(pieces, r, opts), JSON.stringify(pieces)).toEqual([])
        // A saved leftover is always preferred over a new sheet (R2): if something went on a new sheet
        // although a leftover of this stock could hold that piece on its own, the plan is wrong.
        for (const s of r.sheets.filter((x) => x.isNew)) {
          for (const p of s.placements) {
            // As typed (R4 tries every unturned spot, leftover first, before it turns anything).
            const tw = p.rotated ? p.h : p.w
            const th = p.rotated ? p.w : p.h
            const lo = derived.freeLeftovers.find((l) => tw <= l.w && th <= l.h)
            if (lo) {
              const usedByOthers = r.sheets.some((x) => !x.isNew && x.usedLeftoverId === lo.id)
              // It may only be skipped because earlier pieces already filled that leftover.
              expect(usedByOthers, `piece ${p.n} went on a new sheet beside a free ${lo.w} × ${lo.h}`).toBe(true)
            }
          }
        }
        // The saved stock itself must stay sound: free leftovers of one physical sheet never overlap
        // each other and always lie on that sheet, however many jobs have cut from it.
        const next = deriveStock([...cuts, { id: 'tmp', type: 'cut', createdAt: 9e9, syncedAt: 9e9, deviceId: 'd', pieces, kerf: opts.kerf, sheets: r.sheets, clientId: UNASSIGNED_CLIENT_ID, clientName: UNASSIGNED_CLIENT_NAME } as CutDoc])
        const free = next.freeLeftovers
        for (let i = 0; i < free.length; i++) {
          const a = free[i]
          expect(a.x >= -1e-6 && a.y >= -1e-6 && a.x + a.w <= a.sheetW + 1e-6 && a.y + a.h <= a.sheetH + 1e-6).toBe(true)
          for (let j = i + 1; j < free.length; j++) {
            const b = free[j]
            if (a.sheetId !== b.sheetId) continue
            const ov = a.x < b.x + b.w - 1e-6 && b.x < a.x + a.w - 1e-6 && a.y < b.y + b.h - 1e-6 && b.y < a.y + a.h - 1e-6
            expect(ov, `leftovers ${a.letter} and ${b.letter} overlap`).toBe(false)
          }
        }
        cuts.push({
          id: `c${k}-${round}`,
          type: 'cut',
          createdAt: 1000 + round,
          syncedAt: 1000 + round,
          deviceId: 'd',
          pieces,
          kerf: opts.kerf,
          sheets: r.sheets,
          clientId: UNASSIGNED_CLIENT_ID,
          clientName: UNASSIGNED_CLIENT_NAME,
        } as CutDoc)
      }
    }
  })

  it('reports a plan that was tampered with', () => {
    const pieces: Piece[] = [{ id: 'a', w: 20, h: 30, qty: 2 }]
    const opts = { sheetW: 48, sheetH: 96, kerf: 0, minLeftover: 1 }
    const r = packJob(pieces, [], opts)
    r.sheets[0].placements[1].x = r.sheets[0].placements[0].x
    r.sheets[0].placements[1].y = r.sheets[0].placements[0].y
    expect(checkPlan(pieces, r, opts).some((p) => p.includes('overlaps'))).toBe(true)
    r.sheets[0].placements.pop()
    expect(checkPlan(pieces, r, opts).some((p) => p.includes('missing'))).toBe(true)
  })

  it('never needs fewer sheets than the material area allows, and never opens a sheet it does not need', () => {
    const rnd = rng(5)
    for (let k = 0; k < 300; k++) {
      const pieces = randomPieces(rnd, 40, 90)
      const opts = { sheetW: 48, sheetH: 96, kerf: 0, minLeftover: 1 }
      const r = packJob(pieces, [], opts)
      const area = pieces.reduce((a, p) => a + p.w * p.h * p.qty, 0)
      expect(r.sheets.length).toBeGreaterThanOrEqual(Math.ceil(area / (48 * 96) - 1e-9))
      expect(r.sheets.length).toBeLessThanOrEqual(pieces.reduce((a, p) => a + p.qty, 0))
    }
  })
})
