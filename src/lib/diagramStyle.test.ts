import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  DG_LIGHT,
  blockTier,
  horizontalTicks,
  rulerLabel,
  blockTierFor,
  smallBlockCallouts,
  blockLabel,
  spreadPositions,
  verticalTicks,
} from './diagramStyle'
import type { Block } from './sheetView'

// The reference job: a 33 x 56 piece at the top-left of a 48 x 96 sheet, 15 x 56 beside it,
// and a 48 x 40 leftover strip underneath.
const blocks: Block[] = [
  { kind: 'cut', x: 0, y: 0, w: 33, h: 56, label: '33 × 56', n: 1 },
  { kind: 'freeNew', x: 33, y: 0, w: 15, h: 56, letter: 'B' },
  { kind: 'freeNew', x: 0, y: 56, w: 48, h: 40, letter: 'A' },
]

describe('verticalTicks', () => {
  it('numbers the real block edges from the bottom: 96 at the top, 0 at the bottom', () => {
    const t = verticalTicks(blocks, 96, 5.9)
    expect(t.map((x) => x.value)).toEqual([96, 40, 0])
    expect(t[0].y).toBe(0)
    expect(t[2].y).toBeCloseTo(96 * 5.9)
  })

  it('keeps both ends but drops an interior edge that crowds one', () => {
    const crowded: Block[] = [{ kind: 'cut', x: 0, y: 0, w: 10, h: 95.5 }]
    const t = verticalTicks(crowded, 96, 5.9)
    expect(t.map((x) => x.value)).toEqual([96, 0])
  })
})

describe('horizontalTicks / rulerLabel', () => {
  it('has majors at 0, half and full width and minors between', () => {
    const t = horizontalTicks(48)
    expect(t.filter((x) => x.major).map((x) => x.value)).toEqual([0, 24, 48])
    expect(t).toHaveLength(5)
    expect(rulerLabel(0, String)).toBe('0')
    expect(rulerLabel(24, String)).toBe('24"')
  })
})

describe('blockTier and smallBlockCallouts', () => {
  it('large blocks carry full text, slivers carry none', () => {
    expect(blockTier(280, 330)).toBe('full')
    expect(blockTier(88, 330)).toBe('medium')
    expect(blockTier(30, 25)).toBe('small')
    expect(blockTier(8, 200)).toBe('tiny')
  })

  it('gives every block too small to show its own size a note and a pointer (R15)', () => {
    const withSliver: Block[] = [...blocks, { kind: 'freeNew', x: 0, y: 0, w: 1, h: 40, letter: 'C' }]
    expect(smallBlockCallouts(withSliver, 5.9)).toEqual([{ key: 'n3', name: 'C', dims: '', ax: 1, ay: 20 }])
    expect(smallBlockCallouts(blocks, 5.9)).toEqual([])
  })

  it('a piece writes #n over its size, then one line across or up the block, then a note', () => {
    const wide: Block = { kind: 'cut', x: 0, y: 0, w: 20, h: 10, label: '20 × 10', n: 3 }
    expect(blockLabel(wide, 20 * 6, 10 * 6)).toEqual({ lines: ['#3', '20 × 10'], size: 20, rotated: false })
    const tall: Block = { kind: 'cut', x: 0, y: 0, w: 10.5, h: 38.6, label: '10.5 × 38.6', n: 15 }
    expect(blockLabel(tall, 10.5 * 6, 38.6 * 6)).toEqual({ lines: ['#15 · 10.5 × 38.6'], size: 12, rotated: true })
    expect(blockTierFor(tall, 6)).toBe('line')
    expect(smallBlockCallouts([tall], 6)).toEqual([])
    const flat: Block = { kind: 'cut', x: 0, y: 0, w: 27.6, h: 4, label: '4 × 27.6', n: 12, rotated: true }
    expect(blockLabel(flat, 27.6 * 6, 4 * 6)).toEqual({ lines: ['#12 · 4 × 27.6'], size: 12, rotated: false })
    const column: Block = { kind: 'cut', x: 0, y: 0, w: 4, h: 27.6, label: '4 × 27.6', n: 9 }
    expect(blockLabel(column, 4 * 6, 27.6 * 6)).toEqual({ lines: ['#9 · 4 × 27.6'], size: 12, rotated: true })
    const sliver: Block = { kind: 'cut', x: 0, y: 0, w: 1.5, h: 4, label: '1.5 × 4', n: 9 }
    expect(blockLabel(sliver, 1.5 * 6, 4 * 6)).toBeNull()
  })

  it('even a 2 x 2 piece gets one', () => {
    const tiny: Block[] = [{ kind: 'cut', x: 5, y: 10, w: 2, h: 2, label: '2 × 2', n: 7 }]
    expect(smallBlockCallouts(tiny, 3)).toEqual([{ key: 'n0', name: 'Piece 7', dims: '2 × 2', ax: 7, ay: 11 }])
  })
})

describe('spreadPositions', () => {
  it('keeps neighbours apart and inside the range', () => {
    expect(spreadPositions([10, 11, 12], 4, 0, 100)).toEqual([10, 14, 18])
    expect(spreadPositions([98, 99, 100], 4, 0, 100)).toEqual([92, 96, 100])
  })
})

describe('diagram tokens', () => {
  it('the light values pinned for print and Save image match index.css exactly', () => {
    const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8')
    const rootBlock = css.slice(css.indexOf('--dg-card: #ffffff;') - 20)
    for (const [token, value] of Object.entries(DG_LIGHT)) {
      expect(rootBlock, token).toContain(`${token}: ${value};`)
    }
  })
})
