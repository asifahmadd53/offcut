import { describe, expect, it } from 'vitest'
import { badgedLeftovers, chooseFreeLabel } from './labelChoice'
import type { Block } from './sheetView'

describe('chooseFreeLabel', () => {
  it('wide block (pw >= 110): one line with letter, size and "free"', () => {
    const choice = chooseFreeLabel('A', 19, 48, 120, 60)
    expect(choice.kind).toBe('wide')
    expect(choice.dims).toBe('19 × 48')
    expect(choice.showFree).toBe(true)
  })

  it('medium block (pw >= 40 and ph >= 34): stacked letter then size, no "free"', () => {
    // The reported bug: block B (18 x 69) at a narrow scale should still show its size.
    const choice = chooseFreeLabel('B', 18, 69, 45, 40)
    expect(choice.kind).toBe('stacked')
    expect(choice.dims).toBe('18 × 69')
  })

  it('tall and narrow block (ph >= 3 * pw, pw >= 18): vertical label', () => {
    const choice = chooseFreeLabel('B', 18, 69, 20, 70)
    expect(choice.kind).toBe('vertical')
    expect(choice.dims).toBe('18 × 69')
  })

  it('tiny block (pw < 18 or ph < 16): falls back to a badge', () => {
    const choice = chooseFreeLabel('C', 2, 77, 10, 12)
    expect(choice.kind).toBe('badge')
    expect(choice.dims).toBe('2 × 77')
  })

  it('a letter is never shown with no size attached, for any block size', () => {
    for (const [pw, ph] of [
      [120, 60],
      [45, 40],
      [20, 70],
      [10, 12],
    ]) {
      const choice = chooseFreeLabel('A', 19, 48, pw, ph)
      expect(choice.dims).toBeTruthy()
    }
  })
})

describe('badgedLeftovers', () => {
  const block = (kind: Block['kind'], w: number, h: number, letter: string): Block => ({
    kind,
    x: 0,
    y: 0,
    w,
    h,
    letter,
  })

  it('lists only free/freeNew/focus blocks that fall back to a badge at the given scale', () => {
    const blocks: Block[] = [
      block('free', 19, 48, 'A'), // wide at scale 1 (pw=19*1=19 -> actually check below)
      block('free', 2, 77, 'B'), // tiny either way
      block('cut', 23, 77, undefined as unknown as string),
    ]
    // scale chosen so A is wide (pw>=110) and B stays tiny (pw<18)
    const result = badgedLeftovers(blocks, 6)
    expect(result).toEqual([{ letter: 'B', dims: '2 × 77' }])
  })

  it('returns an empty list when nothing falls back to a badge', () => {
    const blocks: Block[] = [block('free', 19, 48, 'A')]
    const result = badgedLeftovers(blocks, 6)
    expect(result).toHaveLength(0)
  })
})
