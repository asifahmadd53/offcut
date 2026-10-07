import { expandPieces, type PackOptions, type PackResult } from './packer'
import type { Piece, Rect } from './types'

const EPS = 1e-6

const inside = (a: Rect, outer: Rect) =>
  a.x >= outer.x - EPS && a.y >= outer.y - EPS && a.x + a.w <= outer.x + outer.w + EPS && a.y + a.h <= outer.y + outer.h + EPS

const overlap = (a: Rect, b: Rect) =>
  a.x < b.x + b.w - EPS && b.x < a.x + a.w - EPS && a.y < b.y + b.h - EPS && b.y < a.y + a.h - EPS

/**
 * An independent audit of a finished plan: it re-derives everything from the pieces and the sheet
 * rules instead of trusting the packer. Returns plain-language problems, or [] when the plan is sound.
 * Checked: every piece is placed once or reported as not fitting, with its real size (turned only when
 * marked); nothing leaves its sheet or leftover; no two parts overlap; saved leftovers are big enough
 * and sit on the sheet; pieces + saved leftovers never add up to more than the area being cut.
 */
export function checkPlan(pieces: Piece[], result: PackResult, opts: PackOptions): string[] {
  const problems: string[] = []
  const items = expandPieces(pieces)
  const want = new Map(items.map((i) => [i.n, i]))
  const seen = new Set<number>()

  for (const u of result.unplaced) {
    if (!want.has(u.n)) problems.push(`Unknown piece ${u.n} reported as not fitting.`)
    if (seen.has(u.n)) problems.push(`Piece ${u.n} listed twice.`)
    seen.add(u.n)
  }

  result.sheets.forEach((s, si) => {
    const tag = `Sheet ${si + 1}`
    const sheet: Rect = { x: 0, y: 0, w: s.sheetW, h: s.sheetH }
    if (!inside(s.region, sheet)) problems.push(`${tag}: the area being cut is outside the sheet.`)
    if (s.isNew && (Math.abs(s.region.w - opts.sheetW) > EPS || Math.abs(s.region.h - opts.sheetH) > EPS)) {
      problems.push(`${tag}: a new sheet is not the saved sheet size.`)
    }
    if (s.placements.length === 0) problems.push(`${tag}: nothing is cut from it.`)

    for (const p of s.placements) {
      const it = want.get(p.n)
      if (!it) {
        problems.push(`${tag}: unknown piece ${p.n}.`)
        continue
      }
      if (seen.has(p.n)) problems.push(`Piece ${p.n} is placed more than once.`)
      seen.add(p.n)
      const w = p.rotated ? it.h : it.w
      const h = p.rotated ? it.w : it.h
      if (Math.abs(p.w - w) > EPS || Math.abs(p.h - h) > EPS) problems.push(`${tag}: piece ${p.n} has the wrong size.`)
      if (!inside(p, s.region)) problems.push(`${tag}: piece ${p.n} is outside the area being cut.`)
    }

    for (const l of s.newLeftovers) {
      if (!inside(l, s.region)) problems.push(`${tag}: leftover ${l.letter} is outside the area being cut.`)
      if (Math.min(l.w, l.h) < opts.minLeftover - EPS) problems.push(`${tag}: leftover ${l.letter} is smaller than the minimum.`)
    }
    const letters = s.newLeftovers.map((l) => l.letter)
    if (new Set(letters).size !== letters.length) problems.push(`${tag}: two leftovers share a letter.`)

    const parts: Array<{ r: Rect; name: string }> = [
      ...s.placements.map((p) => ({ r: p as Rect, name: `piece ${p.n}` })),
      ...s.newLeftovers.map((l) => ({ r: l as Rect, name: `leftover ${l.letter}` })),
    ]
    for (let i = 0; i < parts.length; i++) {
      for (let j = i + 1; j < parts.length; j++) {
        if (overlap(parts[i].r, parts[j].r)) problems.push(`${tag}: ${parts[i].name} overlaps ${parts[j].name}.`)
      }
    }

    const used = parts.reduce((a, p) => a + p.r.w * p.r.h, 0)
    if (used > s.region.w * s.region.h + 1e-4) problems.push(`${tag}: pieces and leftovers add up to more than the area.`)
    if (s.cuts && s.cuts.length !== s.steps.length) problems.push(`${tag}: cut lines and cut steps do not match.`)
  })

  for (const it of items) if (!seen.has(it.n)) problems.push(`Piece ${it.n} is missing from the plan.`)
  if (opts.allowNewSheets === false && result.sheets.some((s) => s.isNew)) problems.push('A new sheet was opened when only one leftover was allowed.')
  return problems
}
