/**
 * A test oracle, not part of the app: the exact smallest number of sheets any guillotine layout can need
 * (pieces may be turned freely, every cut costs one blade width). It is exact but only fast enough for
 * jobs of a few piece sizes, so the tests use it to check the real engine against the true optimum.
 *
 * For a set of pieces it keeps the list of every (width, height) bounding box a guillotine layout of
 * those pieces can have (dominated ones dropped); two sets combine side by side or one above the other.
 * A set fits a sheet when some box is no bigger than the sheet. The least number of sheets then
 * comes from covering the counts of each size with fitting sets.
 */
type P = [number, number]

export type SizeCount = [w: number, h: number, count: number]

export function exactMinSheets(types: SizeCount[], kerf: number, sheetW = 48, sheetH = 96): number {
  const infl = types.map(([w, h]) => (w + kerf) * (h + kerf))
  const memo = new Map<string, P[]>()
  const prune = (pts: P[]): P[] => {
    pts.sort((a, b) => a[0] - b[0] || a[1] - b[1])
    const out: P[] = []
    let bestH = Infinity
    for (const p of pts) {
      if (p[1] < bestH - 1e-9) {
        out.push(p)
        bestH = p[1]
      }
    }
    return out
  }
  const key = (c: number[]) => c.join(',')
  const boxes = (c: number[]): P[] => {
    const k = key(c)
    const hit = memo.get(k)
    if (hit) return hit
    const n = c.reduce((a, b) => a + b, 0)
    let res: P[] = []
    // Blades included, the pieces cannot take more room than the sheet has.
    const area = c.reduce((a, q, i) => a + q * infl[i], 0)
    if (area > (sheetW + kerf) * (sheetH + kerf) + 1e-6) {
      memo.set(k, res)
      return res
    }
    if (n === 1) {
      const i = c.findIndex((q) => q === 1)
      const [w, h] = types[i]
      if (w <= sheetW && h <= sheetH) res.push([w, h])
      if (h <= sheetW && w <= sheetH && w !== h) res.push([h, w])
      res = prune(res)
    } else {
      const sub = new Array<number>(c.length).fill(0)
      const pts: P[] = []
      const go = (i: number) => {
        if (i === c.length) {
          const s1 = sub.reduce((a, b) => a + b, 0)
          if (s1 === 0 || s1 === n) return
          const rest = c.map((q, j) => q - sub[j])
          if (key(sub) > key(rest)) return
          const f1 = boxes([...sub])
          const f2 = boxes(rest)
          if (!f1.length || !f2.length) return
          for (const a of f1) {
            for (const b of f2) {
              const w1 = a[0] + kerf + b[0]
              const h1 = Math.max(a[1], b[1])
              if (w1 <= sheetW + 1e-9 && h1 <= sheetH + 1e-9) pts.push([w1, h1])
              const w2 = Math.max(a[0], b[0])
              const h2 = a[1] + kerf + b[1]
              if (w2 <= sheetW + 1e-9 && h2 <= sheetH + 1e-9) pts.push([w2, h2])
            }
          }
          return
        }
        for (let q = 0; q <= c[i]; q++) {
          sub[i] = q
          go(i + 1)
        }
        sub[i] = 0
      }
      go(0)
      res = prune(pts)
    }
    memo.set(k, res)
    return res
  }

  const counts = types.map((t) => t[2])
  const fitting: number[][] = []
  const enumerate = (i: number, cur: number[]) => {
    if (i === types.length) {
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

  const best = new Map<string, number>()
  const solve = (rem: number[]): number => {
    if (rem.every((r) => r === 0)) return 0
    const k = key(rem)
    const hit = best.get(k)
    if (hit !== undefined) return hit
    let m = Infinity
    const first = rem.findIndex((r) => r > 0)
    for (const p of fitting) {
      if (p[first] === 0 || p.some((c, i) => c > rem[i])) continue
      const v = 1 + solve(rem.map((r, i) => r - p[i]))
      if (v < m) m = v
    }
    best.set(k, m)
    return m
  }
  return solve(counts)
}
