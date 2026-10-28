/**
 * Exact sheet planning for small jobs.
 *
 * The everyday planner places pieces one after another, which is fast but can miss a layout that needs a
 * different grouping (a column of two pieces beside a third, say) and then opens a sheet it did not need.
 * For a job with few different sizes this module finds the true fewest sheets, and a layout for each,
 * by looking at every way a set of pieces can be cut edge to edge:
 *
 *  - For every set of pieces it keeps each (width, height) box that some guillotine layout of the set fits
 *    in, dropping boxes that are bigger in every way (and no better in turned pieces).
 *  - Two sets join side by side (widths add, plus one blade) or one above the other (heights add, plus one blade).
 *  - A set fits a sheet when one of its boxes fits the sheet; the fewest sheets then comes from covering
 *    the pieces with sets that fit.
 *
 * Pure and deterministic. It gives up (returns null) when the job is too big to search quickly; the caller
 * then keeps the everyday plan.
 */

const EPS = 1e-6

export interface ExactItem {
  /** Piece number in the job. */
  n: number
  /** Pieces cut from the same typed size share a type. */
  type: string
  w: number
  h: number
}

/** A saw cut tree: either one piece, or two groups cut apart side by side ('v') or one above the other ('h'). */
export type LayoutNode =
  | { kind: 'leaf'; w: number; h: number; type: string; turned: boolean }
  | { kind: 'v' | 'h'; w: number; h: number; a: LayoutNode; b: LayoutNode }

interface Entry {
  w: number
  h: number
  /** How many pieces are turned in this layout, so the layout with the fewest turns wins. */
  turns: number
  how:
    | { k: 'leaf'; type: number; turned: boolean }
    | { k: 'v' | 'h'; c1: number[]; e1: number; c2: number[]; e2: number }
}

export interface ExactOptions {
  sheetW: number
  sheetH: number
  kerf: number
}

/** A job bigger than this is left to the everyday planner. */
const MAX_TYPES = 9
const MAX_SETS = 20_000
const MAX_WORK = 22_000_000

const keyOf = (c: number[]) => c.join(',')

/** Keeps only boxes no other box beats (smaller or equal in width, height and turned pieces). */
function prune(list: Entry[], charge: (n: number) => void): Entry[] {
  list.sort((a, b) => a.w - b.w || a.h - b.h || a.turns - b.turns)
  const out: Entry[] = []
  for (const e of list) {
    charge(out.length + 1)
    let dominated = false
    for (const o of out) {
      if (o.w <= e.w + EPS && o.h <= e.h + EPS && o.turns <= e.turns) {
        dominated = true
        break
      }
    }
    if (!dominated) out.push(e)
  }
  return out
}

/**
 * The fewest sheets for these pieces, with a saw-cut layout for each sheet, or null when the job is too
 * big to search (or has no answer). Each returned layout lists the pieces it holds as a tree.
 */
export function exactSheetLayouts(items: ExactItem[], opts: ExactOptions): Array<{ tree: LayoutNode; counts: Record<string, number> }> | null {
  const { sheetW, sheetH, kerf } = opts
  if (items.length === 0) return []

  // One slot per type, in order of first appearance.
  const typeNames: string[] = []
  const typeDims: Array<[number, number]> = []
  const counts: number[] = []
  for (const it of items) {
    let i = typeNames.indexOf(it.type)
    if (i < 0) {
      i = typeNames.length
      typeNames.push(it.type)
      typeDims.push([it.w, it.h])
      counts.push(0)
    }
    counts[i] += 1
  }
  if (typeNames.length > MAX_TYPES) return null
  const sets = counts.reduce((p, c) => p * (c + 1), 1)
  if (sets > MAX_SETS) return null

  const infl = typeDims.map(([w, h]) => (w + kerf) * (h + kerf))
  const sheetArea = (sheetW + kerf) * (sheetH + kerf)
  let work = 0
  let tooBig = false
  // Every step of the search is paid for here, so a job that is too big to finish quickly gives up the same way every time.
  const spend = (n: number) => {
    work += n
    if (work > MAX_WORK) tooBig = true
  }

  const memo = new Map<string, Entry[]>()
  const boxes = (c: number[]): Entry[] => {
    const k = keyOf(c)
    const hit = memo.get(k)
    if (hit) return hit
    const n = c.reduce((a, b) => a + b, 0)
    let res: Entry[] = []
    // With a blade's width added to every side, the pieces can never cover more than the sheet does.
    const area = c.reduce((a, q, i) => a + q * infl[i], 0)
    if (area > sheetArea + EPS || tooBig) {
      memo.set(k, res)
      return res
    }
    if (n === 1) {
      const i = c.findIndex((q) => q === 1)
      const [w, h] = typeDims[i]
      if (w <= sheetW + EPS && h <= sheetH + EPS) res.push({ w, h, turns: 0, how: { k: 'leaf', type: i, turned: false } })
      if (h <= sheetW + EPS && w <= sheetH + EPS && Math.abs(w - h) > EPS) {
        res.push({ w: h, h: w, turns: 1, how: { k: 'leaf', type: i, turned: true } })
      }
      res = prune(res, spend)
    } else {
      const sub = new Array<number>(c.length).fill(0)
      const found: Entry[] = []
      const go = (i: number) => {
        if (tooBig) return
        if (i === c.length) {
          const s1 = sub.reduce((a, b) => a + b, 0)
          if (s1 === 0 || s1 === n) return
          const rest = c.map((q, j) => q - sub[j])
          // Each pair of groups once: the smaller key is group one.
          if (keyOf(sub) > keyOf(rest)) return
          const c1 = [...sub]
          const f1 = boxes(c1)
          const f2 = boxes(rest)
          if (!f1.length || !f2.length) return
          for (let x = 0; x < f1.length; x++) {
            for (let y = 0; y < f2.length; y++) {
              const a = f1[x]
              const b = f2[y]
              // Boxes come widest-last, so once side by side is too wide only the stacked join can still fit.
              const sideBySide = a.w + kerf + b.w <= sheetW + EPS
              spend(1)
              if (tooBig) return
              if (!sideBySide && a.h + kerf + b.h > sheetH + EPS) continue
              const w1 = a.w + kerf + b.w
              const h1 = Math.max(a.h, b.h)
              if (sideBySide && h1 <= sheetH + EPS) {
                found.push({ w: w1, h: h1, turns: a.turns + b.turns, how: { k: 'v', c1, e1: x, c2: rest, e2: y } })
              }
              const w2 = Math.max(a.w, b.w)
              const h2 = a.h + kerf + b.h
              if (w2 <= sheetW + EPS && h2 <= sheetH + EPS) {
                found.push({ w: w2, h: h2, turns: a.turns + b.turns, how: { k: 'h', c1, e1: x, c2: rest, e2: y } })
              }
            }
          }
          return
        }
        for (let q = 0; q <= c[i]; q++) {
          sub[i] = q
          go(i + 1)
          if (tooBig) return
        }
        sub[i] = 0
      }
      go(0)
      res = prune(found, spend)
    }
    memo.set(k, res)
    return res
  }

  // Every set of pieces that fits on one sheet.
  const fitting: number[][] = []
  const enumerate = (i: number, cur: number[]) => {
    if (tooBig) return
    if (i === counts.length) {
      if (cur.some((c) => c > 0) && boxes(cur).length > 0) fitting.push([...cur])
      return
    }
    for (let c = 0; c <= counts[i]; c++) {
      cur.push(c)
      enumerate(i + 1, cur)
      cur.pop()
    }
  }
  enumerate(0, [])
  if (tooBig) return null

  // The fewest sheets (then the fewest turned pieces) that cover everything.
  const patTurns = fitting.map((pat) => Math.min(...boxes(pat).map((e) => e.turns)))
  const best = new Map<string, { cost: number; pick: number }>()
  const solve = (rem: number[]): number => {
    if (rem.every((r) => r === 0)) return 0
    const k = keyOf(rem)
    const hit = best.get(k)
    if (hit) return hit.cost
    let bestCost = Infinity
    let pick = -1
    const first = rem.findIndex((r) => r > 0)
    for (let p = 0; p < fitting.length; p++) {
      spend(3)
      if (tooBig) return Infinity
      const pat = fitting[p]
      if (pat[first] === 0 || pat.some((c, i) => c > rem[i])) continue
      const cost = 1000 + patTurns[p] + solve(rem.map((r, i) => r - pat[i]))
      if (cost < bestCost - EPS) {
        bestCost = cost
        pick = p
      }
    }
    best.set(k, { cost: bestCost, pick })
    return bestCost
  }
  const total = solve(counts)
  if (tooBig || !Number.isFinite(total)) return null

  const sheetsOf = (cost: number) => Math.floor((cost + 1e-6) / 1000)
  const needed = sheetsOf(total)

  // Among the plans with the fewest sheets, the one whose emptiest sheet holds the least: that sheet is
  // left nearly whole, so the biggest possible leftover is saved for the next job.
  const pieceArea = typeDims.map(([w, h]) => w * h)
  const areaOf = (pat: number[]) => pat.reduce((a, c, i) => a + c * pieceArea[i], 0)
  let lastPat: number[] | null = null
  if (needed > 1) {
    const order = fitting.map((_, i) => i).sort((x, y) => areaOf(fitting[x]) - areaOf(fitting[y]) || patTurns[x] - patTurns[y] || x - y)
    for (const idx of order) {
      const pat = fitting[idx]
      if (pat.some((c, i) => c > counts[i])) continue
      const rest = counts.map((r, i) => r - pat[i])
      if (rest.every((r) => r === 0)) continue
      const c = solve(rest)
      if (tooBig) return null
      if (Number.isFinite(c) && sheetsOf(c) === needed - 1) {
        lastPat = pat
        break
      }
    }
  }

  const out: Array<{ tree: LayoutNode; counts: Record<string, number> }> = []
  const lay = (pat: number[]) => {
    // The box with the fewest turned pieces, then the smallest.
    const list = boxes(pat)
    let chosen = 0
    for (let i = 1; i < list.length; i++) {
      const a = list[i]
      const b = list[chosen]
      if (a.turns < b.turns || (a.turns === b.turns && a.w * a.h < b.w * b.h - EPS)) chosen = i
    }
    const build = (c: number[], e: number): LayoutNode => {
      const entry = boxes(c)[e]
      if (entry.how.k === 'leaf') {
        return { kind: 'leaf', w: entry.w, h: entry.h, type: typeNames[entry.how.type], turned: entry.how.turned }
      }
      const { c1, e1, c2, e2 } = entry.how
      return { kind: entry.how.k, w: entry.w, h: entry.h, a: build(c1, e1), b: build(c2, e2) }
    }
    const tree = build(pat, chosen)
    const made: Record<string, number> = {}
    pat.forEach((c, i) => {
      if (c > 0) made[typeNames[i]] = c
    })
    out.push({ tree, counts: made })
  }
  let rem = lastPat ? counts.map((r, i) => r - lastPat![i]) : counts
  while (!rem.every((r) => r === 0)) {
    const pat = fitting[best.get(keyOf(rem))!.pick]
    lay(pat)
    rem = rem.map((r, i) => r - pat[i])
  }
  // The emptiest sheet comes last.
  if (lastPat) lay(lastPat)
  return out
}
