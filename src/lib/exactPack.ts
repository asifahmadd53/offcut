/**
 * Exact sheet planning for small jobs.
 *
 * The everyday planner places pieces one after another, which is fast but can miss a layout that needs a
 * different grouping (a column of two pieces beside a third, say) and then opens a sheet it did not need.
 * For a job with few different sizes this module finds the true fewest sheets, and a layout for each,
 * by looking at every way a set of pieces can be cut edge to edge:
 *
 *  - For every set of pieces it keeps each (width, height) box that some guillotine layout of the set fits
 *    in, dropping boxes that are bigger in every way.
 *  - Two sets join side by side (widths add, plus one blade) or one above the other (heights add, plus one blade).
 *  - A set fits a sheet when one of its boxes fits the sheet; the fewest sheets then comes from covering
 *    the pieces with sets that fit.
 *  - Among the plans with the fewest sheets it takes the one whose emptiest sheet holds the least, so the
 *    biggest possible leftover is saved.
 *
 * A set of pieces is a whole number (a mixed-radix code of how many of each size it holds), which keeps the
 * search fast. Pure and deterministic. It gives up (returns null) when the job is too big to search quickly,
 * counted in steps rather than seconds so it gives up the same way every time; the caller then keeps the
 * everyday plan.
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
  /** How many pieces are turned in this layout (used to prefer the layout with the fewest). */
  turns: number
  how: { k: 'leaf'; type: number; turned: boolean } | { k: 'v' | 'h'; s1: number; e1: number; s2: number; e2: number }
}

export interface ExactOptions {
  sheetW: number
  sheetH: number
  kerf: number
  /** A smaller search budget than usual, for the quick checks the planner makes many times. */
  maxWork?: number
  /** Never turn a piece (the sheets have a grain). */
  noTurn?: boolean
}

/** A job bigger than this is left to the everyday planner. */
const MAX_TYPES = 9
const MAX_SETS = 20_000
const MAX_WORK = 6_000_000

/** Keeps only boxes no other box beats; of boxes with the same size, the one with the fewest turned pieces. */
function prune(list: Entry[], charge: (n: number) => void): Entry[] {
  // Sorting is the costly part of a long list, so it is paid for in steps too.
  charge(list.length * 4)
  list.sort((a, b) => a.w - b.w || a.h - b.h || a.turns - b.turns)
  const out: Entry[] = []
  let bestH = Infinity
  for (const e of list) {
    // Sorted by width, so a box is useful only when it is shorter than every narrower (or equal) one.
    if (e.h < bestH - EPS) {
      out.push(e)
      bestH = e.h
    }
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
  const T = typeNames.length
  if (T > MAX_TYPES) return null
  const sets = counts.reduce((p, c) => p * (c + 1), 1)
  if (sets > MAX_SETS) return null

  // A set of pieces is the number  idx = sum(count[i] * stride[i]);  dec[idx * T + i] is count[i].
  const stride: number[] = []
  let acc = 1
  for (let i = 0; i < T; i++) {
    stride.push(acc)
    acc *= counts[i] + 1
  }
  const dec = new Uint8Array(sets * T)
  const size = new Int32Array(sets)
  const infl = typeDims.map(([w, h]) => (w + kerf) * (h + kerf))
  const pieceArea = typeDims.map(([w, h]) => w * h)
  const inflArea = new Float64Array(sets)
  const realArea = new Float64Array(sets)
  for (let idx = 0; idx < sets; idx++) {
    let r = idx
    for (let i = T - 1; i >= 0; i--) {
      // Decode from the most significant type down.
      const c = Math.floor(r / stride[i])
      r -= c * stride[i]
      dec[idx * T + i] = c
      size[idx] += c
      inflArea[idx] += c * infl[i]
      realArea[idx] += c * pieceArea[i]
    }
  }
  const fullIdx = sets - 1
  const sheetArea = (sheetW + kerf) * (sheetH + kerf)

  const limit = opts.maxWork ?? MAX_WORK
  let work = 0
  let tooBig = false
  // Every step of the search is paid for here, so a job that is too big to finish quickly gives up the same way every time.
  const spend = (n: number) => {
    work += n
    if (work > limit) tooBig = true
  }

  const memo: Array<Entry[] | undefined> = new Array(sets)
  const boxes = (idx: number): Entry[] => {
    const hit = memo[idx]
    if (hit) return hit
    let res: Entry[] = []
    // With a blade's width added to every side, the pieces can never cover more than the sheet does.
    if (inflArea[idx] > sheetArea + EPS || tooBig) {
      memo[idx] = res
      return res
    }
    if (size[idx] === 1) {
      let t = 0
      while (dec[idx * T + t] !== 1) t++
      const [w, h] = typeDims[t]
      if (w <= sheetW + EPS && h <= sheetH + EPS) res.push({ w, h, turns: 0, how: { k: 'leaf', type: t, turned: false } })
      if (!opts.noTurn && h <= sheetW + EPS && w <= sheetH + EPS && Math.abs(w - h) > EPS) {
        res.push({ w: h, h: w, turns: 1, how: { k: 'leaf', type: t, turned: true } })
      }
      res = prune(res, spend)
    } else {
      const found: Entry[] = []
      // Every way to split the set into two groups (an odometer over how many of each size go to group one).
      const sub = new Array<number>(T).fill(0)
      const top = Array.from({ length: T }, (_, i) => dec[idx * T + i])
      let s1 = 0
      for (;;) {
        let i = 0
        while (i < T && sub[i] === top[i]) {
          s1 -= sub[i] * stride[i]
          sub[i] = 0
          i++
        }
        if (i === T) break
        sub[i] += 1
        s1 += stride[i]
        spend(1)
        const s2 = idx - s1
        // Each pair of groups once, and neither empty.
        if (s2 === 0 || s1 > s2) continue
        const f1 = boxes(s1)
        if (!f1.length) continue
        const f2 = boxes(s2)
        if (!f2.length) continue
        for (let x = 0; x < f1.length; x++) {
          for (let y = 0; y < f2.length; y++) {
            const a = f1[x]
            const b = f2[y]
            spend(1)
            const side = a.w + kerf + b.w
            const stack = a.h + kerf + b.h
            if (side <= sheetW + EPS && Math.max(a.h, b.h) <= sheetH + EPS) {
              found.push({ w: side, h: Math.max(a.h, b.h), turns: a.turns + b.turns, how: { k: 'v', s1, e1: x, s2, e2: y } })
            }
            if (stack <= sheetH + EPS && Math.max(a.w, b.w) <= sheetW + EPS) {
              found.push({ w: Math.max(a.w, b.w), h: stack, turns: a.turns + b.turns, how: { k: 'h', s1, e1: x, s2, e2: y } })
            }
          }
        }
        if (tooBig) break
      }
      res = prune(found, spend)
    }
    memo[idx] = res
    return res
  }

  // Every set of pieces that fits on one sheet, and for each size the sets that hold it.
  const fitting: number[] = []
  for (let idx = 1; idx < sets; idx++) {
    if (tooBig) return null
    if (inflArea[idx] > sheetArea + EPS) continue
    if (boxes(idx).length > 0) fitting.push(idx)
  }
  if (tooBig) return null
  const byType: number[][] = Array.from({ length: T }, () => [])
  for (const p of fitting) for (let i = 0; i < T; i++) if (dec[p * T + i] > 0) byType[i].push(p)
  const patTurns = new Map<number, number>()
  for (const p of fitting) patTurns.set(p, Math.min(...boxes(p).map((e) => e.turns)))

  // The fewest sheets (then the fewest turned pieces) that cover everything.
  const cost = new Float64Array(sets).fill(NaN)
  const pick = new Int32Array(sets).fill(-1)
  const solve = (rem: number): number => {
    if (rem === 0) return 0
    if (!Number.isNaN(cost[rem])) return cost[rem]
    let bestCost = Infinity
    let bestPick = -1
    let first = 0
    while (dec[rem * T + first] === 0) first++
    for (const p of byType[first]) {
      spend(2)
      if (tooBig) return Infinity
      if (p > rem) continue
      let ok = true
      for (let i = 0; i < T; i++) {
        if (dec[p * T + i] > dec[rem * T + i]) {
          ok = false
          break
        }
      }
      if (!ok) continue
      const c = 1000 + patTurns.get(p)! + solve(rem - p)
      if (c < bestCost - EPS) {
        bestCost = c
        bestPick = p
      }
    }
    cost[rem] = bestCost
    pick[rem] = bestPick
    return bestCost
  }
  const total = solve(fullIdx)
  if (tooBig || !Number.isFinite(total)) return null
  const sheetsOf = (c: number) => Math.floor((c + 1e-6) / 1000)
  const needed = sheetsOf(total)

  // Among the plans with the fewest sheets, the one whose emptiest sheet holds the least: that sheet is
  // left nearly whole, so the biggest possible leftover is saved for the next job.
  let lastPat = -1
  if (needed > 1) {
    const order = [...fitting].sort((x, y) => realArea[x] - realArea[y] || patTurns.get(x)! - patTurns.get(y)! || x - y)
    for (const p of order) {
      if (p === fullIdx) continue
      const rest = fullIdx - p
      const c = solve(rest)
      if (tooBig) return null
      if (Number.isFinite(c) && sheetsOf(c) === needed - 1) {
        lastPat = p
        break
      }
    }
  }

  const out: Array<{ tree: LayoutNode; counts: Record<string, number> }> = []
  const lay = (p: number) => {
    // The box with the fewest turned pieces, then the smallest.
    const list = boxes(p)
    let chosen = 0
    for (let i = 1; i < list.length; i++) {
      const a = list[i]
      const b = list[chosen]
      if (a.turns < b.turns || (a.turns === b.turns && a.w * a.h < b.w * b.h - EPS)) chosen = i
    }
    const build = (s: number, e: number): LayoutNode => {
      const entry = boxes(s)[e]
      if (entry.how.k === 'leaf') {
        return { kind: 'leaf', w: entry.w, h: entry.h, type: typeNames[entry.how.type], turned: entry.how.turned }
      }
      const { s1, e1, s2, e2 } = entry.how
      return { kind: entry.how.k, w: entry.w, h: entry.h, a: build(s1, e1), b: build(s2, e2) }
    }
    const made: Record<string, number> = {}
    for (let i = 0; i < T; i++) if (dec[p * T + i] > 0) made[typeNames[i]] = dec[p * T + i]
    out.push({ tree: build(p, chosen), counts: made })
  }
  let rem = lastPat >= 0 ? fullIdx - lastPat : fullIdx
  while (rem !== 0) {
    const p = pick[rem]
    lay(p)
    rem -= p
  }
  // The emptiest sheet comes last.
  if (lastPat >= 0) lay(lastPat)
  return out
}
