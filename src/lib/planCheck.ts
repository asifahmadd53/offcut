import { expandPieces, type PackOptions, type PackResult } from './packer'
import type { Piece, Rect, SheetPlan } from './types'

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
    // A grained sheet keeps its lines running top to bottom: no piece on it is turned.
    if (opts.grain && !s.grain) problems.push(`${tag}: the job has grain but this sheet is not marked as grained.`)

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
      if (p.rotated && (opts.grain || s.grain)) problems.push(`${tag}: piece ${p.n} is turned on a sheet with grain.`)
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
    // A saw cut runs edge to edge: it stays inside the area being cut and never goes through a piece.
    for (const c of s.cuts ?? []) {
      const horizontal = c.kind === 'across'
      const lo = horizontal ? s.region.x : s.region.y
      const hi = horizontal ? s.region.x + s.region.w : s.region.y + s.region.h
      const inside = horizontal ? c.pos >= s.region.y - EPS && c.pos <= s.region.y + s.region.h + EPS : c.pos >= s.region.x - EPS && c.pos <= s.region.x + s.region.w + EPS
      if (!inside || c.from < lo - EPS || c.to > hi + EPS || c.to < c.from - EPS) problems.push(`${tag}: cut ${c.n} is outside the area being cut.`)
      for (const p of s.placements) {
        const crosses = horizontal
          ? c.pos > p.y + EPS && c.pos < p.y + p.h - EPS && c.from < p.x + p.w - EPS && c.to > p.x + EPS
          : c.pos > p.x + EPS && c.pos < p.x + p.w - EPS && c.from < p.y + p.h - EPS && c.to > p.y + EPS
        if (crosses) problems.push(`${tag}: cut ${c.n} goes through piece ${p.n}.`)
      }
      // ...and never through a leftover that is kept: a saved leftover must come out as one whole piece.
      for (const l of s.newLeftovers) {
        const crosses = horizontal
          ? c.pos > l.y + EPS && c.pos < l.y + l.h - EPS && c.from < l.x + l.w - EPS && c.to > l.x + EPS
          : c.pos > l.x + EPS && c.pos < l.x + l.w - EPS && c.from < l.y + l.h - EPS && c.to > l.y + EPS
        if (crosses) problems.push(`${tag}: cut ${c.n} goes through leftover ${l.letter}.`)
      }
    }
    if (s.cuts && s.cuts.length > 0) {
      problems.push(...checkEdges(s, opts, tag))
      if (opts.layout === 'length' || opts.layout === 'width') problems.push(...checkStrips(s, opts, tag))
    }
  })

  for (const it of items) if (!seen.has(it.n)) problems.push(`Piece ${it.n} is missing from the plan.`)
  if (opts.allowNewSheets === false && result.sheets.some((s) => s.isNew)) problems.push('A new sheet was opened when only one leftover was allowed.')
  return problems
}

/**
 * Every piece is cut free by saw cuts: each of its four sides lies on the edge of the area being cut, or
 * on a cut line that runs along the whole side (a blade width away for the side that follows the cut).
 */
function checkEdges(s: SheetPlan, opts: PackOptions, tag: string): string[] {
  const out: string[] = []
  const cuts = s.cuts ?? []
  const k = opts.kerf
  const R = s.region
  const T = 1e-4
  for (const p of s.placements) {
    const downs = cuts.filter((c) => c.kind === 'down' && c.from <= p.y + T && c.to >= p.y + p.h - T)
    const acrosses = cuts.filter((c) => c.kind === 'across' && c.from <= p.x + T && c.to >= p.x + p.w - T)
    const right = p.x + p.w >= R.x + R.w - T || downs.some((c) => Math.abs(c.pos - (p.x + p.w)) < T)
    const left = p.x <= R.x + T || downs.some((c) => Math.abs(c.pos + k - p.x) < T)
    const bottom = p.y + p.h >= R.y + R.h - T || acrosses.some((c) => Math.abs(c.pos - (p.y + p.h)) < T)
    const top = p.y <= R.y + T || acrosses.some((c) => Math.abs(c.pos + k - p.y) < T)
    if (!right || !left || !bottom || !top) out.push(`${tag}: piece ${p.n} is not cut free by the cut lines.`)
  }
  return out
}

/**
 * A strip layout cuts in rounds. Round 1 cuts run the whole length (or width) of the area; every round 2
 * cut stays inside one strip; with 2 rounds there is nothing else, and with 3 a round 3 cut stays inside
 * one cell, so no later cut crosses an earlier one.
 */
function checkStrips(s: SheetPlan, opts: PackOptions, tag: string): string[] {
  const out: string[] = []
  const cuts = s.cuts ?? []
  const R = s.region
  const T = 1e-4
  const k = opts.kerf
  const length = opts.layout === 'length'
  const first = length ? 'down' : 'across'
  const second = length ? 'across' : 'down'
  // Cut positions and spans on the strip axes: a runs across the strips, b along them.
  const a0 = length ? R.x : R.y
  const aEnd = length ? R.x + R.w : R.y + R.h
  const b0 = length ? R.y : R.x
  const bEnd = length ? R.y + R.h : R.x + R.w
  const full = cuts.filter((c) => c.kind === first && c.from <= b0 + T && c.to >= bEnd - T).sort((x, y) => x.pos - y.pos)
  const intervals: Array<[number, number]> = []
  let start = a0
  for (const c of full) {
    intervals.push([start, c.pos])
    start = c.pos + k
  }
  intervals.push([start, aEnd])
  for (const c of cuts.filter((x) => x.kind === second)) {
    if (!intervals.some(([lo, hi]) => c.from >= lo - T && c.to <= hi + T)) {
      out.push(`${tag}: cut ${c.n} runs across more than one strip.`)
    }
  }
  for (const c of cuts.filter((x) => x.kind === first && !(x.from <= b0 + T && x.to >= bEnd - T))) {
    if ((opts.levels ?? 2) === 2) {
      out.push(`${tag}: cut ${c.n} is a third round of cutting but only 2 rounds are allowed.`)
      continue
    }
    // A third-round cut stays inside one cell: no second-round cut crosses it.
    for (const d of cuts.filter((x) => x.kind === second)) {
      if (d.pos > c.from + T && d.pos < c.to - T && d.from < c.pos - T && d.to > c.pos + T) {
        out.push(`${tag}: cut ${c.n} is crossed by cut ${d.n}.`)
      }
    }
  }
  return out
}
