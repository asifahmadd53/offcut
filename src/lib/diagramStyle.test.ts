import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  DG_LIGHT,
  blockTier,
  horizontalTicks,
  placeBadges,
  rulerLabel,
  smallBlockNotes,
  verticalTicks,
  legendRows,
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

describe('blockTier and smallBlockNotes', () => {
  it('large blocks carry full text, slivers carry none', () => {
    expect(blockTier(280, 330)).toBe('full')
    expect(blockTier(88, 330)).toBe('medium')
    expect(blockTier(30, 25)).toBe('small')
    expect(blockTier(8, 200)).toBe('tiny')
  })

  it('lists every block too small to show its own size (R15)', () => {
    const withSliver: Block[] = [...blocks, { kind: 'freeNew', x: 0, y: 0, w: 1, h: 40, letter: 'C' }]
    expect(smallBlockNotes(withSliver, 5.9).map((n) => n.text)).toEqual(['C · 1 × 40'])
    expect(smallBlockNotes(blocks, 5.9)).toEqual([])
  })
})

describe('placeBadges', () => {
  it('leaves well-spaced badges exactly where their cuts end', () => {
    const out = placeBadges([
      { n: 1, x: 300, y: 100, axis: 'y' },
      { n: 2, x: 120, y: 60, axis: 'x' },
    ])
    expect(out.every((b) => b.x === b.ox && b.y === b.oy)).toBe(true)
  })

  it('slides crowded badges apart so none overlap, and remembers where each cut ends', () => {
    const items = [
      { n: 1, x: 300, y: 100, axis: 'y' as const },
      { n: 2, x: 300, y: 104, axis: 'y' as const },
      { n: 3, x: 300, y: 98, axis: 'y' as const },
      { n: 4, x: 300, y: 110, axis: 'y' as const },
    ]
    const out = placeBadges(items, 26)
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        expect(Math.hypot(out[i].x - out[j].x, out[i].y - out[j].y)).toBeGreaterThanOrEqual(25.99)
      }
    }
    for (const b of out) expect(items.find((i) => i.n === b.n)).toMatchObject({ x: b.ox, y: b.oy })
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

describe('legendRows', () => {
  it('keeps one row when everything fits and wraps when it does not', () => {
    expect(legendRows([90, 120, 80], 400, 18)).toEqual([[0, 1, 2]])
    expect(legendRows([90, 120, 80], 250, 18)).toEqual([[0, 1], [2]])
    expect(legendRows([90, 120, 80], 100, 18)).toEqual([[0], [1], [2]])
  })
})
