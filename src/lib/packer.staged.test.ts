import { describe, expect, it } from 'vitest'
import { packJob } from './packer'
import { checkPlan } from './planCheck'
import { deriveStock } from './stock'
import { UNASSIGNED_CLIENT_ID, UNASSIGNED_CLIENT_NAME, type CutDoc, type LayoutMethod, type Piece } from './types'

const base = { sheetW: 48, sheetH: 96, kerf: 0.125, minLeftover: 1 }
const piece = (id: string, w: number, h: number, qty: number): Piece => ({ id, w, h, qty })

function rng(seed: number) {
  let s = seed
  return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296
}

const strips: Array<{ layout: Exclude<LayoutMethod, 'normal'>; levels: 2 | 3 }> = [
  { layout: 'length', levels: 2 },
  { layout: 'length', levels: 3 },
  { layout: 'width', levels: 2 },
  { layout: 'width', levels: 3 },
]

const cutFrom = (id: string, pieces: Piece[], sheets: CutDoc['sheets'], at: number, kerf: number): CutDoc => ({
  id,
  type: 'cut',
  createdAt: at,
  syncedAt: at,
  deviceId: 'd',
  pieces,
  kerf,
  sheets,
  clientId: UNASSIGNED_CLIENT_ID,
  clientName: UNASSIGNED_CLIENT_NAME,
})

describe('strip layouts: the sheet is cut in rounds', () => {
  const job = [piece('a', 20, 30, 3), piece('b', 20, 10, 2), piece('c', 15, 30, 2)]

  it('first cut along the length: the first cut runs the whole length of the sheet, then each strip is cut across', () => {
    const o = { ...base, layout: 'length' as const, levels: 2 as const }
    const r = packJob(job, [], o)
    expect(r.unplaced).toHaveLength(0)
    const cuts = r.sheets[0].cuts!
    expect(cuts[0].kind).toBe('down')
    expect(cuts[0].from).toBe(0)
    expect(cuts[0].to).toBe(96)
    expect(checkPlan(job, r, o)).toEqual([])
  })

  it('first cut along the width: the first cut runs the whole width of the sheet, then each strip is cut down', () => {
    const o = { ...base, layout: 'width' as const, levels: 2 as const }
    const r = packJob(job, [], o)
    const cuts = r.sheets[0].cuts!
    expect(cuts[0].kind).toBe('across')
    expect(cuts[0].from).toBe(0)
    expect(cuts[0].to).toBe(48)
    expect(checkPlan(job, r, o)).toEqual([])
  })

  it('2 rounds: the pieces of a strip are all as wide as the strip', () => {
    const o = { ...base, layout: 'length' as const, levels: 2 as const }
    const r = packJob(job, [], o)
    const byStrip = new Map<number, Set<number>>()
    for (const p of r.sheets[0].placements) {
      const set = byStrip.get(p.x) ?? new Set<number>()
      set.add(p.w)
      byStrip.set(p.x, set)
    }
    for (const widths of byStrip.values()) expect(widths.size).toBe(1)
  })

  it('3 rounds can hold pieces of different widths in one strip and keeps what is trimmed off as a leftover', () => {
    const mixed = [piece('a', 20, 30, 1), piece('b', 14, 30, 1), piece('c', 20, 20, 1)]
    const o = { ...base, layout: 'length' as const, levels: 3 as const }
    const r = packJob(mixed, [], o)
    expect(r.unplaced).toHaveLength(0)
    expect(checkPlan(mixed, r, o)).toEqual([])
    // Everything fits one sheet cut in strips, and the plan keeps leftovers (the trims and the rest of the sheet).
    expect(r.sheets).toHaveLength(1)
    expect(r.sheets[0].newLeftovers.length).toBeGreaterThan(0)
  })

  it('every strip layout, 2 or 3 rounds, with or without grain: 400 random jobs, every piece placed, every cut a clean edge-to-edge cut', () => {
    const rnd = rng(77)
    const q = (x: number) => Math.round(x * 8) / 8
    for (let k = 0; k < 400; k++) {
      const s = strips[k % 4]
      const grain = k % 3 === 0
      const o = { ...base, kerf: [0, 0.125][Math.floor(rnd() * 2)], layout: s.layout, levels: s.levels, grain }
      const ps = Array.from({ length: 2 + Math.floor(rnd() * 8) }, (_, i) => piece(`p${i}`, q(2 + rnd() * 44), q(2 + rnd() * 90), 1 + Math.floor(rnd() * 3)))
      const r = packJob(ps, [], o)
      expect(checkPlan(ps, r, o), JSON.stringify({ s, grain, ps })).toEqual([])
      expect(r.unplaced, JSON.stringify(ps)).toHaveLength(0)
      if (grain) expect(r.sheets.flatMap((sh) => sh.placements).every((p) => !p.rotated)).toBe(true)
    }
  })

  it('the same job always gives the same strip plan', () => {
    const shape = () =>
      packJob(job, [], { ...base, layout: 'length', levels: 3 }).sheets.map((s) => s.placements.map((p) => `${p.n}:${p.x},${p.y},${p.w}x${p.h}${p.rotated ? 'r' : ''}`).join(' '))
    expect(shape()).toEqual(shape())
  })
})

describe('strip layouts: leftovers are never missed', () => {
  it('a saved leftover is used before a new sheet, in every strip layout, over chains of jobs', () => {
    const rnd = rng(9)
    const q = (x: number) => Math.round(x * 8) / 8
    for (let k = 0; k < 60; k++) {
      const s = strips[k % 4]
      const o = { ...base, kerf: [0, 0.125][Math.floor(rnd() * 2)], layout: s.layout, levels: s.levels, grain: k % 2 === 0 }
      const cuts: CutDoc[] = []
      for (let round = 0; round < 4; round++) {
        const d = deriveStock(cuts)
        const ps = Array.from({ length: 1 + Math.floor(rnd() * 6) }, (_, i) => piece(`p${i}`, q(2 + rnd() * 30), q(2 + rnd() * 60), 1 + Math.floor(rnd() * 3)))
        const r = packJob(ps, d.freeLeftovers, o, new Set(), d.sheetLetters)
        expect(checkPlan(ps, r, o), JSON.stringify({ s, ps })).toEqual([])
        // R2: a piece on a new sheet never fits, as typed, a saved leftover that the plan did not use up.
        const usedIds = new Set(r.sheets.filter((sh) => !sh.isNew).map((sh) => sh.usedLeftoverId))
        for (const sh of r.sheets.filter((x) => x.isNew)) {
          for (const p of sh.placements) {
            const lo = d.freeLeftovers.find((l) => !usedIds.has(l.id) && p.w <= l.w && p.h <= l.h)
            expect(lo, `piece ${p.n} went on a new sheet beside a free ${lo?.w} × ${lo?.h}`).toBeUndefined()
          }
        }
        cuts.push(cutFrom(`c${k}-${round}`, ps, r.sheets, round + 1, o.kerf))
      }
    }
  })

  it('no piece on a later sheet could join an earlier sheet: the earlier sheet laid out again with it never fits (strip layouts)', () => {
    const rnd = rng(404)
    const q = (x: number) => Math.round(x * 8) / 8
    for (let k = 0; k < 120; k++) {
      const s = strips[k % 4]
      const o = { ...base, layout: s.layout, levels: s.levels }
      const ps = Array.from({ length: 3 + Math.floor(rnd() * 5) }, (_, i) => piece(`p${i}`, q(3 + rnd() * 28), q(3 + rnd() * 60), 1 + Math.floor(rnd() * 3)))
      const r = packJob(ps, [], o)
      const dims = (placed: Array<{ pieceId: string; w: number; h: number; rotated: boolean }>) =>
        placed.map((p) => ({ id: p.pieceId, w: p.rotated ? p.h : p.w, h: p.rotated ? p.w : p.h }))
      r.sheets.forEach((sh, j) => {
        for (const p of sh.placements) {
          for (let i = 0; i < j; i++) {
            const together = [...dims(r.sheets[i].placements), ...dims([p])]
            const merged = new Map<string, number>()
            const pieces: Piece[] = []
            for (const t of together) {
              const key = `${t.id}:${t.w}x${t.h}`
              merged.set(key, (merged.get(key) ?? 0) + 1)
            }
            for (const [key, qty] of merged) {
              const [id, size] = key.split(':')
              const [w, h] = size.split('x').map(Number)
              pieces.push(piece(id, w, h, qty))
            }
            const again = packJob(pieces, [], o)
            expect(again.sheets.length === 1 && again.unplaced.length === 0, `piece ${p.n} (sheet ${j + 1}) could join sheet ${i + 1}`).toBe(false)
          }
        }
      })
    }
  })
})
