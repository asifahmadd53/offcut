import { fmtLeft } from './inches'
import type { Block } from './sheetView'

export type FreeLabelKind = 'wide' | 'stacked' | 'vertical' | 'badge'

export interface FreeLabelChoice {
  kind: FreeLabelKind
  letter: string
  dims: string
  /** Only meaningful for 'wide': whether "free" fits alongside the size. */
  showFree: boolean
}

/**
 * Picks how to label a free / freeNew / focus block on the diagram, given its on-screen
 * size in pixels. A letter is never shown alone when the size can be shown in some form
 * (dialog change: every free block must carry its size, not just its letter).
 */
export function chooseFreeLabel(letter: string, w: number, h: number, pw: number, ph: number): FreeLabelChoice {
  const dims = fmtLeft(w, h)

  if (pw >= 110) {
    return { kind: 'wide', letter, dims, showFree: true }
  }
  if (pw >= 40 && ph >= 34) {
    return { kind: 'stacked', letter, dims, showFree: false }
  }
  if (ph >= 3 * pw && pw >= 18) {
    return { kind: 'vertical', letter, dims, showFree: false }
  }
  return { kind: 'badge', letter, dims, showFree: false }
}

/**
 * Free/freeNew/focus blocks that would fall back to a badge at this scale, so a caller
 * can add their size to the legend beside the diagram ("B: 18 × 69") even though the
 * block itself only shows a lettered dot.
 */
export function badgedLeftovers(
  blocks: Block[],
  scale: number,
): Array<{ letter: string; dims: string }> {
  return blocks
    .filter((b) => b.kind === 'free' || b.kind === 'freeNew' || b.kind === 'focus')
    .map((b) => chooseFreeLabel(b.letter ?? '', b.w, b.h, b.w * scale, b.h * scale))
    .filter((choice) => choice.kind === 'badge')
    .map(({ letter, dims }) => ({ letter, dims }))
}
