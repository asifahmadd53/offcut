import type { Derived } from './stock'
import type { Rect, SheetPlan } from './types'

export type BlockKind = 'cut' | 'earlier' | 'free' | 'freeNew' | 'focus' | 'waste'

export interface Block extends Rect {
  kind: BlockKind
  /** First line of text, for example "23 × 77". */
  label?: string
  /** Letter of a leftover (A, B, A2). */
  letter?: string
  n?: number
  rotated?: boolean
}

/**
 * Everything drawn on one physical sheet for a plan:
 *   cut      pieces of this plan
 *   freeNew  leftovers this plan creates
 *   free     other leftovers still free on the same sheet
 *   earlier  pieces cut in earlier jobs on the same sheet
 */
export function buildBlocks(
  plan: SheetPlan,
  derived: Derived,
  selfCutId?: string,
): Block[] {
  const blocks: Block[] = []
  const own = new Set(plan.newLeftovers.map((n) => n.id))

  for (const cut of derived.activeCuts) {
    if (cut.id === selfCutId) continue
    for (const s of cut.sheets) {
      if (s.sheetId !== plan.sheetId) continue
      for (const p of s.placements) {
        blocks.push({ kind: 'earlier', x: p.x, y: p.y, w: p.w, h: p.h })
      }
    }
  }

  for (const l of derived.leftovers) {
    if (l.sheetId !== plan.sheetId) continue
    if (l.id === plan.usedLeftoverId || own.has(l.id)) continue
    if (l.status === 'free') {
      blocks.push({ kind: 'free', x: l.x, y: l.y, w: l.w, h: l.h, letter: l.letter })
    }
  }

  for (const n of plan.newLeftovers) {
    const now = derived.leftovers.find((l) => l.id === n.id)
    blocks.push({
      kind: now && now.status === 'used' ? 'earlier' : 'freeNew',
      x: n.x,
      y: n.y,
      w: n.w,
      h: n.h,
      letter: n.letter,
    })
  }

  for (const p of plan.placements) {
    blocks.push({
      kind: 'cut',
      x: p.x,
      y: p.y,
      w: p.w,
      h: p.h,
      label: p.label,
      n: p.n,
      rotated: p.rotated,
    })
  }

  return blocks
}
