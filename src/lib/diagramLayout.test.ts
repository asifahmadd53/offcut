import { describe, expect, it } from 'vitest'
import {
  allRectSizeLabels,
  badgedLeftovers,
  chooseFreeLabel,
  chooseLabel,
  computeWasteCells,
  cutLinesFor,
  diagramAriaLabel,
  edgesToSegments,
  estimateTextWidth,
  extractEdges,
  nudgeLabels,
  stackCallouts,
  wasteLabelFits,
} from './diagramLayout'
import { packJob } from './packer'
import type { Block } from './sheetView'
import type { Piece } from './types'

const opts = { sheetW: 48, sheetH: 96, kerf: 0, minLeftover: 1 }
const piece = (w: number, h: number, qty: number, id = `${w}x${h}`): Piece => ({ id, w, h, qty })

describe('extractEdges / edgesToSegments', () => {
  it('simple case: two side-by-side blocks give three x edges and two segments', () => {
    const blocks: Block[] = [
      { kind: 'cut', x: 0, y: 0, w: 23, h: 77 },
      { kind: 'cut', x: 23, y: 0, w: 23, h: 77 },
    ]
    const edges = extractEdges(blocks, 'x', 0, 48)
    expect(edges).toEqual([0, 23, 46, 48])
    const segs = edgesToSegments(edges)
    expect(segs.map((s) => s.label)).toEqual(['23', '23', '2'])
  })

  it('golden example layout (23 x 77 x 2): x edges 0,23,46,48 and y edges 0,77,96', () => {
    const r = packJob([piece(23, 77, 2)], [], opts)
    const s = r.sheets[0]
    const blocks: Block[] = [
      ...s.placements.map((p): Block => ({ kind: 'cut', x: p.x, y: p.y, w: p.w, h: p.h })),
      ...s.newLeftovers.map((l): Block => ({ kind: 'freeNew', x: l.x, y: l.y, w: l.w, h: l.h, letter: l.letter })),
    ]
    const xEdges = extractEdges(blocks, 'x', 0, 48)
    const yEdges = extractEdges(blocks, 'y', 0, 96)
    expect(xEdges).toEqual([0, 23, 46, 48])
    expect(yEdges).toEqual([0, 77, 96])
  })
})

describe('chooseLabel', () => {
  it('wide piece: two-line label with size and piece number', () => {
    const block: Block = { kind: 'cut', x: 0, y: 0, w: 23, h: 77, label: '23 × 77', n: 1 }
    const plan = chooseLabel(block, 3) // pw=69, ph=231
    expect(plan.kind).toBe('piece')
    expect(plan.piece?.kind).toBe('two-line')
    expect(plan.piece?.line2).toBe('Piece 1')
  })

  it('wide leftover: solid chip with letter, size and "free"', () => {
    const block: Block = { kind: 'freeNew', x: 0, y: 77, w: 48, h: 19, letter: 'A' }
    const plan = chooseLabel(block, 3) // pw=144
    expect(plan.kind).toBe('free')
    expect(plan.free?.kind).toBe('wide')
    expect(plan.free?.showFree).toBe(true)
  })

  it('narrow strip like B (2 x 77): never bare-letter-only even at badge scale, dims always kept', () => {
    const block: Block = { kind: 'freeNew', x: 46, y: 0, w: 2, h: 77, letter: 'B' }
    const plan = chooseLabel(block, 3) // pw=6, ph=231 -- too narrow even for the vertical form
    expect(plan.kind).toBe('free')
    expect(plan.free?.kind).toBe('badge')
    expect(plan.free?.dims).toBe('2 × 77')
  })

  it('a wider narrow strip (pw>=18) uses the vertical stacked form instead of a badge', () => {
    const block: Block = { kind: 'freeNew', x: 0, y: 0, w: 2, h: 77, letter: 'B' }
    const plan = chooseLabel(block, 10) // pw=20, ph=770
    expect(plan.free?.kind).toBe('vertical')
    expect(plan.free?.dims).toBe('2 × 77')
  })

  it('tiny block: badge fallback still carries dims (never bare letter)', () => {
    const block: Block = { kind: 'free', x: 0, y: 0, w: 2, h: 3, letter: 'C' }
    const plan = chooseLabel(block, 1)
    expect(plan.free?.kind).toBe('badge')
    expect(plan.free?.dims).toBeTruthy()
  })

  it('a turned piece gets "Turned" as its second line when there is room', () => {
    const block: Block = { kind: 'cut', x: 0, y: 0, w: 23, h: 19, label: '19 × 23', n: 3, rotated: true }
    const plan = chooseLabel(block, 3)
    expect(plan.piece?.line2).toBe('Turned')
  })

  it('confirms chooseFreeLabel/badgedLeftovers direct exports still work (labelChoice.ts thin re-export)', () => {
    expect(chooseFreeLabel('A', 19, 48, 120, 60).kind).toBe('wide')
    expect(badgedLeftovers([{ kind: 'free', x: 0, y: 0, w: 2, h: 77, letter: 'B' }], 1)).toEqual([
      { letter: 'B', dims: '2 × 77' },
    ])
  })
})

describe('computeWasteCells', () => {
  it('a real gap case: an L-shaped leftover configuration leaves an uncovered corner', () => {
    const region = { x: 0, y: 0, w: 10, h: 10 }
    const blocks: Block[] = [
      { kind: 'cut', x: 0, y: 0, w: 6, h: 6 },
      { kind: 'freeNew', x: 6, y: 0, w: 4, h: 10, letter: 'A' },
      // bottom-left 6x4 area is left uncovered -> waste
    ]
    const cells = computeWasteCells(blocks, region)
    const totalWaste = cells.reduce((sum, c) => sum + c.w * c.h, 0)
    expect(totalWaste).toBeCloseTo(24, 6) // 6 * 4
  })

  it('kerf-on thin-strip case: a thin gap between two pieces is captured as waste', () => {
    const region = { x: 0, y: 0, w: 20, h: 10 }
    const blocks: Block[] = [
      { kind: 'cut', x: 0, y: 0, w: 10, h: 10 },
      { kind: 'cut', x: 10.125, y: 0, w: 9.875, h: 10 }, // 0.125" kerf gap between them
    ]
    const cells = computeWasteCells(blocks, region)
    const kerfStrip = cells.find((c) => Math.abs(c.w - 0.125) < 1e-6)
    expect(kerfStrip).toBeTruthy()
    expect(kerfStrip?.h).toBeCloseTo(10, 6)
  })

  it('wasteLabelFits gates the "Waste" text on a minimum pixel size', () => {
    expect(wasteLabelFits(40, 24)).toBe(true)
    expect(wasteLabelFits(10, 10)).toBe(false)
  })
})

describe('nudgeLabels', () => {
  it('separates two overlapping labels by nudging the later one right', () => {
    const labels = [
      { center: 100, text: '23', halfWidth: 15 },
      { center: 120, text: '2', halfWidth: 8 },
    ]
    const result = nudgeLabels(labels)
    expect(result.overflow).toHaveLength(0)
    expect(result.placed).toHaveLength(2)
    const byText = new Map(result.placed.map((p) => [p.text, p]))
    const halfWidths = new Map(labels.map((l) => [l.text, l.halfWidth]))
    const sorted = [...result.placed].sort((a, b) => a.center - b.center)
    const gap =
      sorted[1].center - halfWidths.get(sorted[1].text)! - (sorted[0].center + halfWidths.get(sorted[0].text)!)
    expect(gap).toBeGreaterThanOrEqual(2 - 1e-6)
    expect(byText.get('2')).toBeTruthy()
  })

  it('drops a label to overflow when nudging cannot resolve extreme crowding', () => {
    const labels = [
      { center: 0, text: 'a', halfWidth: 50 },
      { center: 1, text: 'b', halfWidth: 50 },
      { center: 2, text: 'c', halfWidth: 50 },
    ]
    const result = nudgeLabels(labels)
    expect(result.overflow.length).toBeGreaterThan(0)
  })

  it('estimateTextWidth grows with text length', () => {
    expect(estimateTextWidth('23')).toBeLessThan(estimateTextWidth('23 1/2'))
  })
})

describe('cutLinesFor', () => {
  it('returns the structured cuts when sheet.cuts is present', () => {
    const r = packJob([piece(23, 77, 2)], [], opts)
    const lines = cutLinesFor(r.sheets[0])
    expect(lines).toEqual([
      { n: 1, kind: 'across', pos: 77, from: 0, to: 48 },
      { n: 2, kind: 'down', pos: 23, from: 0, to: 77 },
      { n: 3, kind: 'down', pos: 46, from: 0, to: 77 },
    ])
  })

  it('falls back to an empty array for older records without cuts (no numbered lines drawn)', () => {
    const lines = cutLinesFor({ cuts: undefined })
    expect(lines).toEqual([])
  })
})

describe('diagramAriaLabel', () => {
  it('mentions cut count when cuts data is available', () => {
    expect(diagramAriaLabel(96, 48, 2, 2, 3)).toBe(
      'Sheet 96 by 48 inches with 2 pieces and 2 leftovers and 3 cuts',
    )
  })

  it('omits cut count when not available (older records)', () => {
    expect(diagramAriaLabel(96, 48, 2, 2)).toBe('Sheet 96 by 48 inches with 2 pieces and 2 leftovers')
  })
})

describe('allRectSizeLabels', () => {
  it('every rectangle in a plan has both dimensions labelled', () => {
    const r = packJob([piece(23, 77, 2)], [], opts)
    const s = r.sheets[0]
    const blocks: Block[] = [
      ...s.placements.map((p): Block => ({ kind: 'cut', x: p.x, y: p.y, w: p.w, h: p.h, label: p.label, n: p.n })),
      ...s.newLeftovers.map((l): Block => ({ kind: 'freeNew', x: l.x, y: l.y, w: l.w, h: l.h, letter: l.letter })),
    ]
    const labels = allRectSizeLabels(blocks, 3)
    expect(labels).toHaveLength(blocks.length)
    for (const l of labels) {
      expect(l.width).toBeTruthy()
      expect(l.height).toBeTruthy()
    }
  })

  it('a 2x77 leftover strip (like leftover B in the golden example) gets a callout', () => {
    const r = packJob([piece(23, 77, 2)], [], opts)
    const s = r.sheets[0]
    const blocks: Block[] = s.newLeftovers.map((l): Block => ({
      kind: 'freeNew',
      x: l.x,
      y: l.y,
      w: l.w,
      h: l.h,
      letter: l.letter,
    }))
    const pxPerInch = 3
    const labels = allRectSizeLabels(blocks, pxPerInch)
    const bIndex = blocks.findIndex((b) => b.letter === 'B')
    expect(bIndex).toBeGreaterThanOrEqual(0)
    expect(labels[bIndex].placement).toBe('callout')
  })

  it('pieces show the size as typed (block.label), not recomputed', () => {
    const block: Block = { kind: 'cut', x: 0, y: 0, w: 23, h: 77, label: '23 × 77', n: 1 }
    const [label] = allRectSizeLabels([block], 3)
    expect(label.width).toBe('23')
    expect(label.height).toBe('77')
  })

  it('leftovers/waste/earlier show size as drawn (fmt(w) x fmt(h)), not short-side-first', () => {
    const block: Block = { kind: 'freeNew', x: 0, y: 0, w: 2, h: 77, letter: 'B' }
    const [label] = allRectSizeLabels([block], 3)
    expect(label.width).toBe('2')
    expect(label.height).toBe('77')
  })

  it('a turned piece keeps its normal size label (turned/Piece text is handled by choosePieceLabel elsewhere)', () => {
    const block: Block = { kind: 'cut', x: 0, y: 0, w: 23, h: 19, label: '19 × 23', n: 3, rotated: true }
    const [label] = allRectSizeLabels([block], 3)
    expect(label.width).toBe('19')
    expect(label.height).toBe('23')
    // choosePieceLabel (existing, unchanged) still marks it Turned:
    expect(chooseLabel(block, 3).piece?.line2).toBe('Turned')
  })

  it('an earlier-cut part on a reused sheet keeps its size', () => {
    const first = packJob([piece(23, 77, 1)], [], opts)
    const sheet1 = first.sheets[0]
    const leftoverStock = sheet1.newLeftovers.map((l) => ({
      id: l.id,
      letter: l.letter,
      x: l.x,
      y: l.y,
      w: l.w,
      h: l.h,
      sheetId: sheet1.sheetId,
      sheetW: sheet1.sheetW,
      sheetH: sheet1.sheetH,
      sheetDate: sheet1.sheetDate,
      createdByCutId: 'cut-1',
      createdAt: 1,
      manual: false,
      status: 'free' as const,
    }))
    const second = packJob([piece(10, 10, 1)], leftoverStock, opts)
    expect(second.sheets).toHaveLength(1)
    const earlierBlock: Block = { kind: 'earlier', x: sheet1.placements[0].x, y: sheet1.placements[0].y, w: sheet1.placements[0].w, h: sheet1.placements[0].h }
    const [label] = allRectSizeLabels([earlierBlock], 3)
    expect(label.width).toBe(fmtWidth(sheet1.placements[0].w))
    expect(label.height).toBe(fmtWidth(sheet1.placements[0].h))
    expect(label.name).toBe('Already cut')
  })

  it('waste cells get sizes', () => {
    const wasteBlock: Block = { kind: 'earlier', x: 0, y: 0, w: 1, h: 1 } // placeholder to keep region non-empty
    const cells = computeWasteCells([wasteBlock], { x: 0, y: 0, w: 10, h: 10 })
    const wasteBlocks: Block[] = cells.map((c) => ({ kind: 'earlier', x: c.x, y: c.y, w: c.w, h: c.h }))
    const labels = allRectSizeLabels(wasteBlocks, 3)
    expect(labels.length).toBeGreaterThan(0)
    for (const l of labels) {
      expect(l.width).toBeTruthy()
      expect(l.height).toBeTruthy()
    }
  })
})

function fmtWidth(n: number): string {
  // local mirror of fmt() for the assertion above, avoids importing it twice in the test
  const sixteenths = Math.round(n * 16)
  const whole = Math.floor(sixteenths / 16)
  let num = sixteenths % 16
  if (num === 0) return String(whole)
  let den = 16
  while (num % 2 === 0) {
    num /= 2
    den /= 2
  }
  return whole > 0 ? `${whole} ${num}/${den}` : `${num}/${den}`
}

describe('stackCallouts', () => {
  it('stacks overlapping callouts without collision, reusing nudgeLabels', () => {
    const callouts = [
      { blockIndex: 0, text: '2 × 77', naturalY: 100 },
      { blockIndex: 1, text: '3 × 10', naturalY: 102 },
      { blockIndex: 2, text: '1 × 5', naturalY: 104 },
    ]
    const result = stackCallouts(callouts, 14)
    const ys = result.map((r) => r.y).sort((a, b) => a - b)
    for (let i = 1; i < ys.length; i++) {
      expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(14 - 1e-6)
    }
  })
})

describe('leftover-only / focus-block plan', () => {
  it('a focus block on a partly-cut parent sheet still gets its own edges and a solid-chip label if wide', () => {
    const blocks: Block[] = [
      { kind: 'earlier', x: 0, y: 0, w: 23, h: 77 },
      { kind: 'earlier', x: 23, y: 0, w: 23, h: 77 },
      { kind: 'focus', x: 0, y: 77, w: 48, h: 19, letter: 'A' },
    ]
    const region = { x: 0, y: 0, w: 48, h: 96 }
    const yEdges = extractEdges(blocks, 'y', region.y, region.h)
    expect(yEdges).toEqual([0, 77, 96])
    const focus = blocks.find((b) => b.kind === 'focus')!
    const plan = chooseLabel(focus, 3)
    expect(plan.free?.kind).toBe('wide')
  })
})
