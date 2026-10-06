import type { EdgeTape, TapeSide } from './types'

/**
 * Edge tape (banding): which sides of a piece get tape. Pure helpers, no UI. Sides are named
 * the way the piece was typed — top and bottom are its width edges, left and right its height
 * edges — and are rotated along with a piece the cutting plan has to turn.
 */

export const TAPE_SIDES: TapeSide[] = ['top', 'right', 'bottom', 'left']

export const tapedSides = (tape?: EdgeTape): TapeSide[] => TAPE_SIDES.filter((s) => tape?.[s])

export const hasTape = (tape?: EdgeTape): boolean => tapedSides(tape).length > 0

/** Only the sides that are on, or undefined when none is (so "no tape" is never stored). */
export function cleanTape(tape?: EdgeTape): EdgeTape | undefined {
  const sides = tapedSides(tape)
  if (sides.length === 0) return undefined
  return Object.fromEntries(sides.map((s) => [s, true])) as EdgeTape
}

/** The same tape on a piece turned a quarter turn clockwise: top→right→bottom→left→top. */
export function rotateTape(tape?: EdgeTape): EdgeTape | undefined {
  if (!hasTape(tape)) return undefined
  return cleanTape({ right: tape?.top, bottom: tape?.right, left: tape?.bottom, top: tape?.left })
}

/** Length of one side of a w × h piece: top/bottom run along the width, left/right along the height. */
export const sideLength = (w: number, h: number, side: TapeSide): number => (side === 'top' || side === 'bottom' ? w : h)

/** Lengths of the taped sides, in top, right, bottom, left order. */
export const tapeLengths = (w: number, h: number, tape?: EdgeTape): number[] => tapedSides(tape).map((s) => sideLength(w, h, s))

export const tapeTotal = (w: number, h: number, tape?: EdgeTape): number => tapeLengths(w, h, tape).reduce((a, b) => a + b, 0)

/** "top, left", "all 4 sides", or "" — for the New job list. */
export function describeSides(tape?: EdgeTape): string {
  const sides = tapedSides(tape)
  if (sides.length === 0) return ''
  if (sides.length === 4) return 'all 4 sides'
  return sides.join(', ')
}

export interface TapePiece {
  n: number
  w: number
  h: number
  tape?: EdgeTape
}

export interface TapeRow {
  n: number
  lengths: number[]
  total: number
}

/** Every taped piece on a sheet (ascending by number) with the lengths of its taped sides, and the sheet's total. */
export function tapeSummary(pieces: TapePiece[]): { rows: TapeRow[]; total: number } {
  const rows = pieces
    .filter((p) => hasTape(p.tape))
    .sort((a, b) => a.n - b.n)
    .map((p) => ({ n: p.n, lengths: tapeLengths(p.w, p.h, p.tape), total: tapeTotal(p.w, p.h, p.tape) }))
  return { rows, total: rows.reduce((t, r) => t + r.total, 0) }
}

/** "123.4 in (10.3 ft)" */
export function tapeTotalText(total: number, fmt: (n: number) => string): string {
  return `${fmt(total)} in (${Math.round((total / 12) * 10) / 10} ft)`
}
