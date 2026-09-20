import { describe, expect, it } from 'vitest'
import {
  badgePositions,
  chooseAllLabels,
  chooseBlockLabel,
  cutLinesFor,
  diagramAriaLabel,
  everyBlockHasASize,
  sizesList,
} from './diagramLayout'
import { packJob } from './packer'
import type { Block } from './sheetView'
import type { Piece } from './types'

const opts = { sheetW: 48, sheetH: 96, kerf: 0, minLeftover: 1 }
const piece = (w: number, h: number, qty: number, id = `${w}x${h}`): Piece => ({ id, w, h, qty })

describe('chooseBlockLabel', () => {
  it('golden example: piece gets a two-line label with its typed size and piece number', () => {
    const r = packJob([piece(23, 77, 2)], [], opts)
    const p = r.sheets[0].placements[0]
    const block: Block = { kind: 'cut', x: p.x, y: p.y, w: p.w, h: p.h, label: p.label, n: p.n }
    const label = chooseBlockLabel(block, 0, 3) // pw=69, ph=231
    expect(label.kind).toBe('inline')
    expect(label.line1).toBe('23 × 77')
    expect(label.line2).toBe('Piece 1')
  })

  it('golden example: leftover A is wide enough for one combined line', () => {
    const r = packJob([piece(23, 77, 2)], [], opts)
    const a = r.sheets[0].newLeftovers.find((l) => l.letter === 'A')!
    const block: Block = { kind: 'freeNew', x: a.x, y: a.y, w: a.w, h: a.h, letter: a.letter }
    const label = chooseBlockLabel(block, 0, 3) // pw = 48*3 = 144
    expect(label.kind).toBe('inline')
    expect(label.line1).toBe('A · 19 × 48')
  })

  it('golden example: narrow leftover B falls back to a letter badge, its size still exists in the Sizes list', () => {
    const r = packJob([piece(23, 77, 2)], [], opts)
    const b = r.sheets[0].newLeftovers.find((l) => l.letter === 'B')!
    const block: Block = { kind: 'freeNew', x: b.x, y: b.y, w: b.w, h: b.h, letter: b.letter }
    const label = chooseBlockLabel(block, 0, 3) // pw = 2*3 = 6, too narrow for any text
    expect(label.kind).toBe('badge')
    expect(label.line1).toBe('B')
    expect(sizesList([block])[0].size).toBe('2 × 77')
  })

  it('a turned piece shows "Turned" as the second line', () => {
    const block: Block = { kind: 'cut', x: 0, y: 0, w: 22, h: 19, label: '19 × 22', n: 3, rotated: true }
    const label = chooseBlockLabel(block, 0, 3)
    expect(label.line2).toBe('Turned')
  })

  it('a piece too small for two lines but big enough for one shows only its size', () => {
    const block: Block = { kind: 'cut', x: 0, y: 0, w: 10, h: 6, label: '10 × 6', n: 4 }
    const label = chooseBlockLabel(block, 0, 4) // pw=40, ph=24: below two-line threshold, above one-line
    expect(label.kind).toBe('inline')
    expect(label.line1).toBe('10 × 6')
    expect(label.line2).toBeUndefined()
  })

  it('an earlier-cut block shows only its size, no "Already cut" text repeated', () => {
    const block: Block = { kind: 'earlier', x: 0, y: 0, w: 23, h: 77 }
    const label = chooseBlockLabel(block, 0, 3)
    expect(label.line1).toBe('23 × 77')
    expect(label.line2).toBeUndefined()
  })

  it('a waste strip too small for its size badges with an empty label (size lives in the Sizes list)', () => {
    const block: Block = { kind: 'waste', x: 0, y: 0, w: 0.5, h: 3 }
    const label = chooseBlockLabel(block, 0, 3) // pw=1.5, ph=9
    expect(label.kind).toBe('badge')
  })
})

describe('sizesList', () => {
  it('golden example: groups the two identical pieces, and lists leftovers B then A in reading order', () => {
    const r = packJob([piece(23, 77, 2)], [], opts)
    const s = r.sheets[0]
    const blocks: Block[] = [
      ...s.placements.map((p): Block => ({ kind: 'cut', x: p.x, y: p.y, w: p.w, h: p.h, label: p.label, n: p.n })),
      ...s.newLeftovers.map((l): Block => ({ kind: 'freeNew', x: l.x, y: l.y, w: l.w, h: l.h, letter: l.letter })),
    ]
    const list = sizesList(blocks)
    // Both 23x77 pieces are identical, so they group into one row (e.g. "1, 2 · 23 × 77").
    // Reading order: pieces (y=0) first, then B (y=0, x=46, after the pieces), then A (y=77).
    const pieceRow = list.find((e) => e.group === 'piece')!
    expect(pieceRow.badges).toEqual(['1', '2'])
    expect(pieceRow.count).toBe(2)
    expect(list.map((e) => e.badges[0] ?? e.name)).toEqual(['1', 'B', 'A'])
  })

  it('groups identical tiny strips into one row with every badge, e.g. "C2, C3 · 1.6 × 18"', () => {
    const blocks: Block[] = [
      { kind: 'free', x: 40, y: 0, w: 1.6, h: 18, letter: 'C2' },
      { kind: 'free', x: 40, y: 18, w: 1.6, h: 18, letter: 'C3' },
      { kind: 'free', x: 40, y: 36, w: 1.6, h: 18, letter: 'C4' },
    ]
    const list = sizesList(blocks)
    expect(list).toHaveLength(1)
    expect(list[0].badges).toEqual(['C2', 'C3', 'C4'])
    expect(list[0].size).toBe('1.6 × 18')
    expect(list[0].count).toBe(3)
  })

  it('every block appears in the list, including waste and earlier-cut rectangles', () => {
    const blocks: Block[] = [
      { kind: 'cut', x: 0, y: 0, w: 23, h: 77, label: '23 × 77', n: 1 },
      { kind: 'free', x: 0, y: 77, w: 48, h: 19, letter: 'A' },
      { kind: 'earlier', x: 0, y: 96, w: 10, h: 10 },
      { kind: 'waste', x: 40, y: 0, w: 3.1, h: 42.4 },
    ]
    const list = sizesList(blocks)
    const total = list.reduce((sum, e) => sum + e.count, 0)
    expect(total).toBe(4)
    expect(list.find((e) => e.name === 'Waste')?.size).toBe('3.1 × 42.4')
  })
})

describe('everyBlockHasASize', () => {
  it('holds for a fixture of at least 12 mixed blocks, including tiny strips (1.6 x 18, 3.1 x 42.4)', () => {
    const blocks: Block[] = [
      { kind: 'cut', x: 0, y: 0, w: 23, h: 77, label: '23 × 77', n: 1 },
      { kind: 'cut', x: 23, y: 0, w: 23, h: 77, label: '23 × 77', n: 2 },
      { kind: 'cut', x: 0, y: 77, w: 3.1, h: 42.4, label: '3.1 × 42.4', n: 3, rotated: true },
      { kind: 'cut', x: 3.1, y: 77, w: 1.6, h: 18, label: '1.6 × 18', n: 4 },
      { kind: 'free', x: 4.7, y: 77, w: 19, h: 48, letter: 'A' },
      { kind: 'free', x: 46, y: 0, w: 2, h: 77, letter: 'B' },
      { kind: 'free', x: 40, y: 0, w: 1.6, h: 18, letter: 'C2' },
      { kind: 'free', x: 40, y: 18, w: 1.6, h: 18, letter: 'C3' },
      { kind: 'free', x: 40, y: 36, w: 1.6, h: 18, letter: 'C4' },
      { kind: 'earlier', x: 0, y: 90, w: 5, h: 5 },
      { kind: 'earlier', x: 5, y: 90, w: 3.1, h: 42.4 },
      { kind: 'waste', x: 8, y: 90, w: 1.6, h: 18 },
    ]
    expect(blocks.length).toBeGreaterThanOrEqual(12)
    // Every scale, from generous to tiny, must still satisfy the invariant: the Sizes
    // list always covers every block regardless of how small it renders on screen.
    expect(everyBlockHasASize(blocks, 3)).toBe(true)
    expect(everyBlockHasASize(blocks, 0.2)).toBe(true)
  })

  it('holds even when every block is a badge (all far too small for inline text)', () => {
    const blocks: Block[] = Array.from({ length: 13 }, (_, i) => ({
      kind: 'free' as const,
      x: i,
      y: 0,
      w: 0.5,
      h: 0.5,
      letter: `L${i}`,
    }))
    expect(everyBlockHasASize(blocks, 1)).toBe(true)
  })
})

describe('badgePositions', () => {
  it('no two badges overlap, for a fixture of tightly packed tiny leftovers', () => {
    const blocks: Block[] = [
      { kind: 'free', x: 40, y: 0, w: 1.6, h: 18, letter: 'C2' },
      { kind: 'free', x: 40, y: 18, w: 1.6, h: 18, letter: 'C3' },
      { kind: 'free', x: 40, y: 36, w: 1.6, h: 18, letter: 'C4' },
      { kind: 'free', x: 40, y: 54, w: 1.6, h: 18, letter: 'C5' },
    ]
    const positions = badgePositions(blocks)
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const dx = positions[i].cx - positions[j].cx
        const dy = positions[i].cy - positions[j].cy
        expect(Math.hypot(dx, dy)).toBeGreaterThan(0)
      }
    }
  })
})

describe('cutLinesFor', () => {
  it('returns the structured cuts when sheet.cuts is present (golden example 1)', () => {
    const r = packJob([piece(23, 77, 2)], [], opts)
    const lines = cutLinesFor(r.sheets[0])
    expect(lines).toEqual([
      { n: 1, kind: 'across', pos: 77, from: 0, to: 48 },
      { n: 2, kind: 'down', pos: 23, from: 0, to: 77 },
      { n: 3, kind: 'down', pos: 46, from: 0, to: 77 },
    ])
  })

  it('falls back to an empty array for older records without cuts', () => {
    expect(cutLinesFor({ cuts: undefined })).toEqual([])
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

describe('chooseAllLabels', () => {
  it('covers every block in a leftover-only / focus-block plan', () => {
    const blocks: Block[] = [
      { kind: 'earlier', x: 0, y: 0, w: 23, h: 77 },
      { kind: 'earlier', x: 23, y: 0, w: 23, h: 77 },
      { kind: 'focus', x: 0, y: 77, w: 48, h: 19, letter: 'A' },
    ]
    const labels = chooseAllLabels(blocks, 3)
    expect(labels).toHaveLength(3)
    const focusLabel = labels[2]
    expect(focusLabel.kind).toBe('inline')
    expect(focusLabel.line1).toBe('A · 19 × 48')
  })
})
