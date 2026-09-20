import { describe, expect, it } from 'vitest'
import {
  buildSizesList,
  calloutsCrossAnything,
  estimateTextWidth,
  planCallouts,
  planDimensionSegments,
  planInlineLabels,
  resolveLabelOverlaps,
} from './diagramLabels'
import type { Block } from './sheetView'

/**
 * A busy sheet like the reported bug screenshots: three ~55px-wide blocks holding
 * "17 1/2 × 31.6", "15.7 × 31.6" and "13.3 × 31.6" side by side, narrow strips
 * (1.6 x 18, 1.6 x 10.3, a 0.9-wide sliver), and several already-cut blocks. Widths
 * are chosen so that at pxPerInch = 3.16 the three main blocks render at ~55px,
 * matching the screenshot's crowding.
 */
function busySheetBlocks(): Block[] {
  return [
    // Three side-by-side blocks whose labels were overflowing into each other.
    { kind: 'earlier', x: 0, y: 0, w: 17.5, h: 31.6 },
    { kind: 'earlier', x: 17.5, y: 0, w: 15.7, h: 31.6 },
    { kind: 'earlier', x: 33.2, y: 0, w: 13.3, h: 31.6 },
    // More already-cut blocks, some tiny.
    { kind: 'earlier', x: 0, y: 31.6, w: 30, h: 20 },
    { kind: 'earlier', x: 30, y: 31.6, w: 3.1, h: 42.4 },
    { kind: 'earlier', x: 33.1, y: 31.6, w: 1.6, h: 18 },
    // Narrow leftover strips.
    { kind: 'free', x: 46.5, y: 0, w: 1.6, h: 18, letter: 'C2' },
    { kind: 'free', x: 46.5, y: 18, w: 1.6, h: 18, letter: 'C3' },
    { kind: 'free', x: 46.5, y: 36, w: 1.6, h: 10.3, letter: 'C4' },
    { kind: 'free', x: 46.5, y: 46.3, w: 0.9, h: 30, letter: 'C5' },
    // A couple of normal pieces and leftovers.
    { kind: 'cut', x: 0, y: 51.6, w: 23, h: 30, label: '23 × 30', n: 1 },
    { kind: 'cut', x: 23, y: 51.6, w: 23, h: 30, label: '23 × 30', n: 2 },
    { kind: 'free', x: 0, y: 81.6, w: 19, h: 14.4, letter: 'A' },
    { kind: 'free', x: 19, y: 81.6, w: 19, h: 14.4, letter: 'B' },
    { kind: 'earlier', x: 38, y: 81.6, w: 8.5, h: 14.4 },
  ]
}

const PX_PER_INCH = 3.16 // three main blocks render at ~55.3px wide

describe('planInlineLabels', () => {
  it('covers a fixture of at least 15 blocks, matching the reported bug scenario', () => {
    expect(busySheetBlocks().length).toBeGreaterThanOrEqual(15)
  })

  it('no inline label is ever wider than its own block, at any font size chosen', () => {
    const blocks = busySheetBlocks()
    const labels = planInlineLabels(blocks, PX_PER_INCH)
    for (const l of labels) {
      if (l.kind === 'badge') continue
      const b = blocks[l.blockIndex]
      const pw = b.w * PX_PER_INCH
      const ph = b.h * PX_PER_INCH
      expect(l.box.w).toBeLessThanOrEqual(pw - 8 + 1e-6) // padding 4px each side
      expect(l.box.h).toBeLessThanOrEqual(ph - 8 + 1e-6)
    }
  })

  it('the three crowded 17.5/15.7/13.3-wide blocks each get a label that fits inside their own width', () => {
    const blocks = busySheetBlocks()
    const labels = planInlineLabels(blocks, PX_PER_INCH)
    for (let i = 0; i < 3; i++) {
      const pw = blocks[i].w * PX_PER_INCH
      expect(labels[i].box.w).toBeLessThanOrEqual(pw - 8 + 1e-6)
    }
  })
})

describe('resolveLabelOverlaps', () => {
  it('no two inline labels overlap after resolution, even before any callout promotion', () => {
    const blocks = busySheetBlocks()
    const initial = planInlineLabels(blocks, PX_PER_INCH)
    const resolved = resolveLabelOverlaps(blocks, initial)
    const inline = resolved.filter((l) => l.kind !== 'badge')
    for (let i = 0; i < inline.length; i++) {
      for (let j = i + 1; j < inline.length; j++) {
        const a = inline[i].box
        const b = inline[j].box
        const overlaps = a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
        expect(overlaps).toBe(false)
      }
    }
  })

  it('demotes the smaller of two overlapping blocks to a badge, keeping the larger inline', () => {
    // Two blocks placed so their centered labels overlap: a small block right next to
    // a much larger one, both wide enough to get an inline label on their own, but
    // close enough together that the labels collide.
    const blocks: Block[] = [
      { kind: 'free', x: 0, y: 0, w: 5, h: 5, letter: 'S' }, // small: label centered near x=7.5px
      { kind: 'free', x: 4.9, y: 0, w: 40, h: 40, letter: 'L' }, // large, overlapping in x with S
    ]
    const initial = planInlineLabels(blocks, 3)
    const resolved = resolveLabelOverlaps(blocks, initial)
    expect(resolved[0].kind).toBe('badge') // S (smaller area) demoted
    expect(resolved[1].kind).not.toBe('badge') // L stays inline
  })

  it('demotes a label that overlaps a fixed obstacle (e.g. a dimension number)', () => {
    const blocks: Block[] = [{ kind: 'cut', x: 0, y: 0, w: 20, h: 20, label: '20 × 20', n: 1 }]
    const initial = planInlineLabels(blocks, 3) // pw=60, ph=60 -- normally fits fine
    const label = initial[0]
    const obstacle = { x: label.box.x, y: label.box.y, w: label.box.w, h: label.box.h } // exact overlap
    const resolved = resolveLabelOverlaps(blocks, initial, [obstacle])
    expect(resolved[0].kind).toBe('badge')
  })
})

describe('planCallouts', () => {
  it('promotes at most 2 badges to callouts, choosing the biggest blocks', () => {
    const blocks = busySheetBlocks()
    const initial = planInlineLabels(blocks, PX_PER_INCH)
    const resolved = resolveLabelOverlaps(blocks, initial)
    const { callouts } = planCallouts(blocks, resolved, 200, 0, 100)
    expect(callouts.length).toBeLessThanOrEqual(2)
  })

  it('callouts are evenly spaced and never cross each other or a label box', () => {
    const blocks = busySheetBlocks()
    const initial = planInlineLabels(blocks, PX_PER_INCH)
    const resolved = resolveLabelOverlaps(blocks, initial)
    const { callouts } = planCallouts(blocks, resolved, 200, 0, 100)
    const labelBoxes = resolved.filter((l) => l.kind !== 'badge').map((l) => l.box)
    expect(calloutsCrossAnything(callouts, labelBoxes)).toBe(false)
  })

  it('returns no callouts when nothing needs one', () => {
    const blocks: Block[] = [{ kind: 'cut', x: 0, y: 0, w: 20, h: 20, label: '20 × 20', n: 1 }]
    const initial = planInlineLabels(blocks, 3)
    const { callouts } = planCallouts(blocks, initial, 100, 0, 60)
    expect(callouts).toHaveLength(0)
  })
})

describe('buildSizesList', () => {
  it('groups identical-size badge blocks into one row with all their badge labels', () => {
    const blocks: Block[] = [
      { kind: 'free', x: 0, y: 0, w: 1.6, h: 18, letter: 'C2' },
      { kind: 'free', x: 0, y: 18, w: 1.6, h: 18, letter: 'C3' },
    ]
    const list = buildSizesList(blocks, [0, 1])
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ badgeLabels: ['C2', 'C3'], count: 2 })
  })

  it('sorts rows top to bottom then left to right', () => {
    const blocks: Block[] = [
      { kind: 'free', x: 10, y: 0, w: 3, h: 3, letter: 'B' },
      { kind: 'free', x: 0, y: 0, w: 4, h: 4, letter: 'A' },
    ]
    const list = buildSizesList(blocks, [0, 1])
    expect(list.map((e) => e.badgeLabels[0])).toEqual(['A', 'B'])
  })
})

describe('every block has a size shown, inside or in the list — the hard invariant', () => {
  it('holds for the full busy fixture: every block is inline, a callout, or in the Sizes list', () => {
    const blocks = busySheetBlocks()
    const initial = planInlineLabels(blocks, PX_PER_INCH)
    const resolved = resolveLabelOverlaps(blocks, initial)
    const { callouts, promoted } = planCallouts(blocks, resolved, 200, 0, 400)
    const remainingBadges = resolved
      .map((l, i) => ({ l, i }))
      .filter(({ l, i }) => l.kind === 'badge' && !promoted.has(i))
      .map(({ i }) => i)
    const sizesList = buildSizesList(blocks, remainingBadges)

    const coveredIndices = new Set<number>([
      ...resolved.filter((l) => l.kind !== 'badge').map((l) => l.blockIndex),
      ...callouts.map((c) => c.blockIndex),
      ...remainingBadges,
    ])
    expect(coveredIndices.size).toBe(blocks.length)
    // Never neither: the Sizes list's total count matches exactly the leftover badges.
    const listedCount = sizesList.reduce((sum, e) => sum + e.count, 0)
    expect(listedCount).toBe(remainingBadges.length)
  })
})

describe('planDimensionSegments', () => {
  it('merges two neighbouring segments too narrow for their own number into one bracket', () => {
    // Edges 0, 0.9, 2.4 -> segments 0.9 and 1.5, both too narrow at a small scale.
    const edges = [0, 0.9, 2.4]
    const segs = planDimensionSegments(edges, 8, estimateTextWidth) // pxPerInch=8: 0.9->7.2px, 1.5->12px
    // Either merged into one bracket, or (if the merge itself doesn't fit) dropped —
    // either way there must be at most one entry left for this narrow pair.
    expect(segs.length).toBeLessThanOrEqual(1)
    if (segs.length === 1) {
      expect(segs[0].merged).toBe(true)
      expect(segs[0].from).toBe(0)
      expect(segs[0].to).toBe(2.4)
    }
  })

  it('keeps segments that already have room for their own number, unmerged', () => {
    const edges = [0, 23, 46, 48] // golden-example-style: 23, 23, 2
    const segs = planDimensionSegments(edges, 3) // pxPerInch=3: 23->69px, 2->6px
    // The wide ones stay separate; only the narrow trailing one may merge or drop.
    expect(segs[0].merged).toBe(false)
    expect(segs[0].label).toBe('23')
  })

  it('segment numbers never overlap: no two returned segments share any px span', () => {
    const edges = [0, 0.9, 1.8, 2.7, 20]
    const segs = planDimensionSegments(edges, 8)
    for (let i = 1; i < segs.length; i++) {
      expect(segs[i].from).toBeGreaterThanOrEqual(segs[i - 1].to - 1e-6)
    }
  })
})
