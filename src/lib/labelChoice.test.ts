import { describe, expect, it } from 'vitest'
import { chooseBlockLabel, everyBlockHasASize, sizesList } from './labelChoice'
import type { Block } from './sheetView'

const piece = (w: number, h: number, n: number, rotated = false): Block => ({
  kind: 'cut',
  x: 0,
  y: 0,
  w,
  h,
  label: `${w} × ${h}`,
  n,
  rotated,
})
const leftover = (w: number, h: number, letter: string, x = 0, y = 0): Block => ({
  kind: 'free',
  x,
  y,
  w,
  h,
  letter,
})

describe('chooseBlockLabel', () => {
  it('a wide leftover gets one combined line', () => {
    const label = chooseBlockLabel(leftover(19, 48, 'A'), 0, 6) // pw = 19*6 = 114
    expect(label.kind).toBe('inline')
    expect(label.line1).toBe('A · 19 × 48')
    expect(label.line2).toBeUndefined()
  })

  it('a medium leftover gets letter then size on two lines', () => {
    // 18 x 69 at scale 2: pw = 36, ph = 138 — room for two lines, not wide enough for one.
    const label = chooseBlockLabel(leftover(18, 69, 'B'), 0, 2)
    expect(label.kind).toBe('inline')
    expect(label.line1).toBe('B')
    expect(label.line2).toBe('18 × 69')
  })

  it('a tiny leftover falls back to a letter badge, never a bare letter with no size anywhere', () => {
    const block = leftover(1.6, 18, 'C2')
    const label = chooseBlockLabel(block, 0, 3) // pw = 4.8, too small for any inline text
    expect(label.kind).toBe('badge')
    expect(label.line1).toBe('C2')
    // The size still appears somewhere: the Sizes list always covers every block.
    const list = sizesList([block])
    expect(list[0].size).toBe('1.6 × 18')
  })

  it('a piece shows its typed size then "Piece N" when there is room', () => {
    const label = chooseBlockLabel(piece(23, 77, 1), 0, 3) // pw = 69, ph = 231
    expect(label.kind).toBe('inline')
    expect(label.line1).toBe('23 × 77')
    expect(label.line2).toBe('Piece 1')
  })

  it('a turned piece shows "Turned" as the second line instead of "Piece N"', () => {
    const label = chooseBlockLabel(piece(22, 19, 1, true), 0, 3)
    expect(label.kind).toBe('inline')
    expect(label.line2).toBe('Turned')
  })

  it('a tiny piece falls back to a number badge', () => {
    const block = piece(3.1, 42.4, 5)
    const label = chooseBlockLabel(block, 0, 2) // pw = 6.2
    expect(label.kind).toBe('badge')
    expect(label.line1).toBe('5')
  })

  it('an earlier-cut block shows only its size, no other words', () => {
    const block: Block = { kind: 'earlier', x: 0, y: 0, w: 20, h: 30 }
    const label = chooseBlockLabel(block, 0, 3) // pw = 60, ph = 90
    expect(label.kind).toBe('inline')
    expect(label.line1).toBe('20 × 30')
    expect(label.line2).toBeUndefined()
  })

  it('a waste block shows only its size, same as earlier cuts', () => {
    const block: Block = { kind: 'waste', x: 0, y: 0, w: 12, h: 15 } // pw=36, ph=45
    const label = chooseBlockLabel(block, 0, 3)
    expect(label.kind).toBe('inline')
    expect(label.line1).toBe('12 × 15')
  })
})

describe('sizesList', () => {
  it('groups identical blocks into one row with all their badges', () => {
    const blocks: Block[] = [leftover(1.6, 18, 'C2', 40, 0), leftover(1.6, 18, 'C3', 40, 18)]
    const list = sizesList(blocks)
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ badges: ['C2', 'C3'], size: '1.6 × 18', count: 2 })
  })

  it('sorts rows top to bottom then left to right', () => {
    const p = piece(6, 6, 1)
    p.y = 10
    const blocks: Block[] = [leftover(5, 5, 'B', 10, 0), leftover(4, 4, 'A', 0, 0), p]
    const list = sizesList(blocks)
    expect(list.map((e) => e.badges[0] ?? e.name)).toEqual(['A', 'B', '1'])
  })

  it('marks a turned piece with a Turned status', () => {
    const list = sizesList([piece(22, 19, 1, true)])
    expect(list[0].status).toBe('Turned')
  })

  it('lists every block, including waste and earlier-cut rectangles', () => {
    const blocks: Block[] = [
      piece(23, 77, 1),
      leftover(19, 48, 'A'),
      { kind: 'earlier', x: 0, y: 80, w: 10, h: 10 },
      { kind: 'waste', x: 40, y: 0, w: 2, h: 5 },
    ]
    const list = sizesList(blocks)
    const total = list.reduce((sum, e) => sum + e.count, 0)
    expect(total).toBe(4)
    expect(list.some((e) => e.group === 'earlier' && e.name === 'Already cut')).toBe(true)
    expect(list.some((e) => e.group === 'earlier' && e.name === 'Waste')).toBe(true)
  })
})

describe('everyBlockHasASize', () => {
  it('holds for a mix of large and tiny blocks of every kind', () => {
    // At least 12 blocks, including tiny strips like 1.6 x 18 and 3.1 x 42.4, per spec.
    const blocks: Block[] = [
      piece(23, 77, 1),
      piece(23, 77, 2, true),
      piece(3.1, 42.4, 3),
      piece(1.6, 18, 4),
      leftover(19, 48, 'A', 0, 77),
      leftover(2, 77, 'B', 46, 0),
      leftover(1.6, 18, 'C2', 40, 0),
      leftover(1.6, 18, 'C3', 40, 18),
      leftover(1.6, 18, 'C4', 40, 36),
      { kind: 'earlier', x: 0, y: 90, w: 5, h: 5 } as Block,
      { kind: 'earlier', x: 5, y: 90, w: 3.1, h: 42.4 } as Block,
      { kind: 'waste', x: 8, y: 90, w: 1.6, h: 18 } as Block,
    ]
    expect(blocks.length).toBeGreaterThanOrEqual(12)
    expect(everyBlockHasASize(blocks, 3)).toBe(true)
    expect(everyBlockHasASize(blocks, 0.3)).toBe(true) // tiny on-screen scale too
  })

  it('holds even when every single block is far too small for any inline label', () => {
    const blocks: Block[] = Array.from({ length: 12 }, (_, i) => leftover(0.5, 0.5, `L${i}`, i, 0))
    expect(everyBlockHasASize(blocks, 1)).toBe(true)
  })
})
