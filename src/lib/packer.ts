import { fmt, getDisplayUnit, pieceDims, unitLabel, type Unit } from './inches'
import { cleanTape, rotateTape } from './tape'
import { uid } from './id'
import { exactSheetLayouts, type LayoutNode } from './exactPack'
import type { EdgeTape, LayoutMethod, Leftover, LeftoverRect, Piece, Placed, Rect, SheetPlan } from './types'
import { isStaged, runStaged, stagedFitAll, stagedOrders, stagedProbe, type StagedState, type StagedVariant } from './stagedPack'

/**
 * Cutting engine.
 *
 * It works like a panel saw: every cut goes edge to edge. When a piece is placed in a
 * free rectangle, the rest of that rectangle is split with a full-width cut below the
 * piece and a cut to the right of it. That is exactly how a carpenter cuts a strip first
 * and then cuts pieces out of the strip.
 *
 * Order of preference for every piece:
 *   1. a saved leftover (smallest free spot that fits)
 *   2. a sheet already opened for this job
 *   3. turned 90 degrees, in the same order as above
 *   4. a brand new sheet (turned only if it does not fit the normal way)
 */

export const EPS = 1e-6
export const r4 = (n: number) => Math.round(n * 1e4) / 1e4

export interface PackOptions {
  sheetW: number
  sheetH: number
  /** Blade thickness. Use 0 when the blade toggle is off. */
  kerf: number
  /** Free areas with a side shorter than this are waste and are not saved. */
  minLeftover: number
  /** When false, a piece that does not fit the given stock is left unplaced instead of opening a new sheet. */
  allowNewSheets?: boolean
  /**
   * The sheets have a grain (lines running top to bottom): no piece is turned on a new sheet, nor on a
   * leftover that was cut from a grained sheet, so every piece keeps its lines running the same way.
   */
  grain?: boolean
  /** How a sheet is cut: any edge-to-edge layout ('normal'), or long strips first ('length'), or wide strips first ('width'). */
  layout?: LayoutMethod
  /** Rounds of cutting a strip layout may use: 2 (strips, then pieces) or 3 (pieces are trimmed too). */
  levels?: 2 | 3
}

export interface Item {
  /** Piece number in the job, starting at 1. */
  n: number
  pieceId: string
  w: number
  h: number
  label: string
  labelUnit?: Unit
  tape?: EdgeTape
}

export interface PackResult {
  sheets: SheetPlan[]
  unplaced: Item[]
}

export interface CutLine {
  kind: 'across' | 'down'
  pos: number
  rect: Rect
  /** Where the saw actually travels along the cut, when that is not the whole free rectangle (full-height cut first). */
  span?: { from: number; to: number }
}

/**
 * How the free rectangle around a placed piece is divided.
 *  'across': a cut across the full width under the piece, then one beside it (the usual order).
 *  'down':   a cut down the full height beside the piece first, then one under it, only as wide as the piece.
 * Both are edge-to-edge saw cuts; 'down' keeps a tall strip whole, which is what a long piece needs next to it.
 */
type SplitMode = 'across' | 'down'

/** Which way a plan divides free rectangles: always across first (the usual), always down first, or whichever leaves the bigger piece of free sheet. */
type SplitPolicy = SplitMode | 'best'

function chooseSplit(policy: SplitPolicy, f: Rect, pw: number, ph: number, kerf: number): SplitMode {
  if (policy !== 'best') return policy
  const rightW = Math.max(0, f.w - pw - kerf)
  const bottomH = Math.max(0, f.h - ph - kerf)
  const across = Math.max(rightW * ph, f.w * bottomH)
  const down = Math.max(rightW * f.h, pw * bottomH)
  return down > across + EPS ? 'down' : 'across'
}

export interface Bin {
  sheetId: string
  sheetW: number
  sheetH: number
  sheetDate: number
  isNew: boolean
  /** The sheet has a grain: nothing is turned on it, and what is left of it keeps the grain. */
  grain?: boolean
  leftover?: Leftover
  region: Rect
  free: Rect[]
  placements: Placed[]
  cuts: CutLine[]
  /** Strip layouts only: how the strips and their cells are laid out (see stagedPack.ts). */
  staged?: StagedState
}

export function expandPieces(pieces: Piece[]): Item[] {
  const items: Item[] = []
  let n = 0
  for (const p of pieces) {
    for (let i = 0; i < p.qty; i++) {
      n += 1
      items.push({ n, pieceId: p.id, w: p.w, h: p.h, label: pieceDims(p), ...(getDisplayUnit() !== 'in' ? { labelUnit: getDisplayUnit() } : {}), tape: cleanTape(p.tape) })
    }
  }
  return items
}

export const fits = (f: Rect, w: number, h: number) => w <= f.w + EPS && h <= f.h + EPS

/** Smallest free rectangle (by area) that holds the piece. */
export function bestFree(bins: Bin[], w: number, h: number): { bin: Bin; idx: number } | null {
  let best: { bin: Bin; idx: number } | null = null
  let bestArea = Infinity
  let bestTie = Infinity
  for (const bin of bins) {
    bin.free.forEach((f, idx) => {
      if (!fits(f, w, h)) return
      const area = f.w * f.h
      const tie = Math.min(f.w - w, f.h - h)
      if (area < bestArea - EPS || (Math.abs(area - bestArea) <= EPS && tie < bestTie)) {
        best = { bin, idx }
        bestArea = area
        bestTie = tie
      }
    })
  }
  return best
}

function place(bin: Bin, idx: number, item: Item, rotated: boolean, kerf: number, mode: SplitMode = 'across') {
  const f = bin.free[idx]
  const pw = rotated ? item.h : item.w
  const ph = rotated ? item.w : item.h
  bin.free.splice(idx, 1)

  const rightW = r4(f.w - pw - kerf)
  const bottomH = r4(f.h - ph - kerf)
  if (mode === 'across') {
    // Cut order: across first (full width), then down.
    if (f.h - ph > EPS) bin.cuts.push({ kind: 'across', pos: r4(f.y + ph), rect: f })
    if (f.w - pw > EPS) bin.cuts.push({ kind: 'down', pos: r4(f.x + pw), rect: f })
    if (rightW > EPS) bin.free.push({ x: r4(f.x + pw + kerf), y: f.y, w: rightW, h: ph })
    if (bottomH > EPS) bin.free.push({ x: f.x, y: r4(f.y + ph + kerf), w: f.w, h: bottomH })
  } else {
    // Full-height cut beside the piece first, then a cut under it across just the piece's own column.
    if (f.w - pw > EPS) bin.cuts.push({ kind: 'down', pos: r4(f.x + pw), rect: f, span: { from: f.y, to: r4(f.y + f.h) } })
    if (f.h - ph > EPS) {
      bin.cuts.push({
        kind: 'across',
        pos: r4(f.y + ph),
        rect: { x: f.x, y: f.y, w: pw, h: f.h },
        span: { from: f.x, to: r4(f.x + pw) },
      })
    }
    if (rightW > EPS) bin.free.push({ x: r4(f.x + pw + kerf), y: f.y, w: rightW, h: f.h })
    if (bottomH > EPS) bin.free.push({ x: f.x, y: r4(f.y + ph + kerf), w: pw, h: bottomH })
  }

  bin.placements.push({
    x: f.x,
    y: f.y,
    w: pw,
    h: ph,
    n: item.n,
    pieceId: item.pieceId,
    label: item.label,
    ...(item.labelUnit ? { labelUnit: item.labelUnit } : {}),
    rotated,
    // The tape turns with the piece, so the sheet drawing shows it on the right sides.
    tape: rotated ? rotateTape(item.tape) : item.tape,
  })
}

/** A, B, C ... for a new sheet. A2, A3 ... for what is left of leftover A. */
export function nextLetter(used: Set<string>, parent?: string): string {
  let letter: string | undefined
  if (!parent) {
    for (const c of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
      if (!used.has(c)) {
        letter = c
        break
      }
    }
    letter ??= `L${used.size + 1}`
  } else {
    const base = parent.replace(/\d+$/, '')
    for (let k = 2; k < 100; k++) {
      if (!used.has(base + k)) {
        letter = base + k
        break
      }
    }
    letter ??= base + uid().slice(0, 3)
  }
  used.add(letter)
  return letter
}

export function buildSteps(bin: Bin): string[] {
  const seen = new Set<string>()
  return bin.cuts.map((c) => {
    const from = c.kind === 'across' ? bin.region.y : bin.region.x
    const base = `Cut ${c.kind} at ${fmt(r4(c.pos - from))} ${unitLabel()}`
    // A second "Cut down at 23 in" on the same sheet would be ambiguous, so say which edge the
    // number counts from and how far into the named part the saw actually goes.
    const into = r4(c.pos - (c.kind === 'across' ? c.rect.y : c.rect.x))
    const edge = c.kind === 'across' ? 'top' : 'left'
    const text = seen.has(base)
      ? `${base} from the ${edge} edge (${fmt(into)} ${unitLabel()} into the ${fmt(c.rect.w)} × ${fmt(c.rect.h)} part)`
      : base
    seen.add(base)
    return text
  })
}

/**
 * Structured data paralleling buildSteps exactly, for the technical-drawing diagram.
 * 'across': the full x-span of the free rect being cut. 'down': the y-span from the top
 * of the free rect to the bottom of the piece that was placed there (its cut length).
 */
export function buildCuts(bin: Bin): SheetPlan['cuts'] {
  return bin.cuts.map((c, i) => {
    if (c.span) return { n: i + 1, kind: c.kind, pos: c.pos, from: c.span.from, to: c.span.to }
    if (c.kind === 'across') {
      return { n: i + 1, kind: 'across' as const, pos: c.pos, from: c.rect.x, to: r4(c.rect.x + c.rect.w) }
    }
    // 'down': the piece placed at the top-left of this free rect sets the cut length.
    const placed = bin.placements.find(
      (p) => Math.abs(p.x - c.rect.x) < EPS && Math.abs(p.y - c.rect.y) < EPS,
    )
    const to = placed ? r4(c.rect.y + placed.h) : c.rect.y + c.rect.h
    return { n: i + 1, kind: 'down' as const, pos: c.pos, from: c.rect.y, to }
  })
}

type ItemOrder = (a: Item, b: Item) => number

/** Extra pseudo-random orders tried per plan, and the work budget (pieces squared times runs) that caps them. */
const EXTRA_RUNS = 240
const EXTRA_WORK = 2_400_000

/** Most times one plan lays a sheet out again to see whether one more piece fits it. */
const MAX_RELAYOUTS = 60
const MAX_RELAYOUT_RUNS = 250
/** A strip layout's runs are cheaper and its sheets fussier, so it may lay a sheet out again many more times. */
const MAX_RELAYOUT_RUNS_STAGED = 4000

/** Pseudo-random piece orders, the same every time: `count` of them for a job of `itemCount` pieces (numbered from 1). */
function seededOrders(count: number, itemCount: number): ItemOrder[] {
  let seed = 0x2545f491
  const rnd = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
  return Array.from({ length: count }, (_, k) => {
    const noise = k % 2 === 0 ? 0.6 : 10
    const keys = Array.from({ length: itemCount + 1 }, () => rnd())
    return (a: Item, b: Item) => b.w * b.h * (1 + noise * keys[b.n % keys.length]) - a.w * a.h * (1 + noise * keys[a.n % keys.length]) || a.n - b.n
  })
}

/**
 * The orders pieces are tried in. The first (largest area first) is the one the plan uses whenever
 * nothing does better; the others exist because a long thin piece (say 4 × 96) is tiny by area, so it
 * is placed last, after every sheet's full-length column has already been broken up by shorter
 * pieces, and it then needs a whole sheet of its own although it would have fitted beside them.
 */
const ORDERS: ItemOrder[] = [
  (a, b) => b.w * b.h - a.w * a.h || b.h - a.h || a.n - b.n,
  (a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) || b.w * b.h - a.w * a.h || a.n - b.n,
  (a, b) => Math.min(b.w, b.h) - Math.min(a.w, a.h) || Math.max(b.w, b.h) - Math.max(a.w, a.h) || a.n - b.n,
  (a, b) => b.h - a.h || b.w - a.w || a.n - b.n,
  (a, b) => b.w - a.w || b.h - a.h || a.n - b.n,
  (a, b) => b.w + b.h - (a.w + a.h) || b.w * b.h - a.w * a.h || a.n - b.n,
]

/** What a plan is made of before it is turned into sheets: the bins (saved leftovers first, then new sheets) and the pieces that fit nowhere. */
export interface Packed {
  bins: Bin[]
  unplaced: Item[]
}

/** Lower is better: every piece placed, then the fewest new sheets, then the biggest single leftover kept. */
function scoreOf(p: Packed, opts: PackOptions): [number, number, number] {
  const used = p.bins.filter((b) => b.placements.length > 0)
  const newSheets = used.filter((b) => b.isNew).length
  const biggest = Math.max(
    0,
    ...used.flatMap((b) => b.free.filter((f) => Math.min(f.w, f.h) >= opts.minLeftover - EPS).map((f) => f.w * f.h)),
  )
  return [p.unplaced.length, newSheets, -biggest]
}

/**
 * Lays one exact layout tree onto a fresh sheet: every cut is edge to edge, the cut the saw makes first
 * is listed first, and whatever the layout leaves unused becomes free rectangles (the leftovers).
 */
function binFromLayout(tree: LayoutNode, items: Map<string, Item[]>, opts: PackOptions): Bin {
  const bin: Bin = {
    sheetId: uid(),
    sheetW: opts.sheetW,
    sheetH: opts.sheetH,
    sheetDate: Date.now(),
    isNew: true,
    grain: Boolean(opts.grain),
    region: { x: 0, y: 0, w: opts.sheetW, h: opts.sheetH },
    free: [],
    placements: [],
    cuts: [],
  }
  const k = opts.kerf
  const emit = (node: LayoutNode, rect: Rect) => {
    // Trim the group's area down to the box the group really needs; the rest is free.
    if (rect.h - node.h > EPS) {
      bin.cuts.push({ kind: 'across', pos: r4(rect.y + node.h), rect, span: { from: rect.x, to: r4(rect.x + rect.w) } })
      const bottomH = r4(rect.h - node.h - k)
      if (bottomH > EPS) bin.free.push({ x: rect.x, y: r4(rect.y + node.h + k), w: rect.w, h: bottomH })
    }
    if (rect.w - node.w > EPS) {
      const strip = { x: rect.x, y: rect.y, w: rect.w, h: node.h }
      bin.cuts.push({ kind: 'down', pos: r4(rect.x + node.w), rect: strip, span: { from: rect.y, to: r4(rect.y + node.h) } })
      const rightW = r4(rect.w - node.w - k)
      if (rightW > EPS) bin.free.push({ x: r4(rect.x + node.w + k), y: rect.y, w: rightW, h: node.h })
    }
    if (node.kind === 'leaf') {
      const item = items.get(node.type)!.shift()!
      bin.placements.push({
        x: rect.x,
        y: rect.y,
        w: node.w,
        h: node.h,
        n: item.n,
        pieceId: item.pieceId,
        label: item.label,
        ...(item.labelUnit ? { labelUnit: item.labelUnit } : {}),
        rotated: node.turned,
        tape: node.turned ? rotateTape(item.tape) : item.tape,
      })
      return
    }
    const box = { x: rect.x, y: rect.y, w: node.w, h: node.h }
    if (node.kind === 'v') {
      bin.cuts.push({ kind: 'down', pos: r4(box.x + node.a.w), rect: box, span: { from: box.y, to: r4(box.y + box.h) } })
      emit(node.a, { x: box.x, y: box.y, w: node.a.w, h: box.h })
      emit(node.b, { x: r4(box.x + node.a.w + k), y: box.y, w: r4(box.w - node.a.w - k), h: box.h })
    } else {
      bin.cuts.push({ kind: 'across', pos: r4(box.y + node.a.h), rect: box, span: { from: box.x, to: r4(box.x + box.w) } })
      emit(node.a, { x: box.x, y: box.y, w: box.w, h: node.a.h })
      emit(node.b, { x: box.x, y: r4(box.y + node.a.h + k), w: box.w, h: r4(box.h - node.a.h - k) })
    }
  }
  emit(tree, { x: 0, y: 0, w: opts.sheetW, h: opts.sheetH })
  return bin
}

/**
 * When the everyday plan opened new sheets, asks the exact search for the fewest sheets those same pieces
 * can need. Only a strictly smaller answer replaces them, so a plan is never made worse, and the sheets that
 * use saved leftovers are left exactly as planned. Small jobs only: a big one keeps the everyday plan.
 */
function improveNewSheets(plan: Packed, pieces: Piece[], opts: PackOptions): Packed {
  // A strip layout has its own rules about where a cut may go; the exact search above knows only the normal layout.
  if (isStaged(opts)) return plan
  const fresh = plan.bins.filter((b) => b.isNew && b.placements.length > 0)
  if (fresh.length < 2) return plan
  const all = new Map(expandPieces(pieces).map((i) => [i.n, i]))
  const chosen: Item[] = []
  for (const b of fresh) for (const p of b.placements) chosen.push(all.get(p.n)!)
  chosen.sort((a, b) => a.n - b.n)
  // Nothing to gain when the plan already uses as few sheets as the pieces' total area (blades included) allows.
  const area = chosen.reduce((a, i) => a + (i.w + opts.kerf) * (i.h + opts.kerf), 0)
  if (fresh.length <= Math.ceil(area / ((opts.sheetW + opts.kerf) * (opts.sheetH + opts.kerf)) - 1e-9)) return plan
  const layouts = exactSheetLayouts(
    chosen.map((i) => ({ n: i.n, type: i.pieceId, w: i.w, h: i.h })),
    { sheetW: opts.sheetW, sheetH: opts.sheetH, kerf: opts.kerf, noTurn: Boolean(opts.grain) },
  )
  if (!layouts || layouts.length > fresh.length) return plan
  if (layouts.length === fresh.length) {
    // Same number of sheets: take the exact plan only if it leaves a sheet emptier (a bigger leftover to save).
    const areaOfType = new Map(chosen.map((i) => [i.pieceId, i.w * i.h]))
    const emptiestExact = Math.min(...layouts.map((l) => Object.entries(l.counts).reduce((a, [t, n]) => a + n * areaOfType.get(t)!, 0)))
    const emptiestNow = Math.min(...fresh.map((b) => b.placements.reduce((a, p) => a + p.w * p.h, 0)))
    if (emptiestExact >= emptiestNow - 1) return plan
  }

  const queues = new Map<string, Item[]>()
  for (const i of chosen) queues.set(i.pieceId, [...(queues.get(i.pieceId) ?? []), i])
  const bins = layouts.map((l) => {
    const mine = new Map<string, Item[]>()
    for (const [t, n] of Object.entries(l.counts)) mine.set(t, queues.get(t)!.splice(0, n))
    return binFromLayout(l.tree, mine, opts)
  })
  return { bins: [...plan.bins.filter((b) => !b.isNew), ...bins], unplaced: plan.unplaced }
}

/** The biggest free rectangle a bin has left, by area (0 when none): the bigger, the more useful the leftover. */
const biggestFree = (b: Bin) => Math.max(0, ...b.free.map((f) => f.w * f.h))

/**
 * Lays these pieces out again in the same place as `like` (a whole new sheet, or the saved leftover it is
 * cut from), in the best way found (the biggest free piece left over), or null when they do not all fit
 * there. Used when a piece moves away from a sheet, and when a piece is added to one.
 */
function relayoutIn(items: Item[], like: Bin, opts: PackOptions, budget: { runs: number } | null, firstFit = false): Bin | null {
  let best: Bin | null = null
  const o = { ...opts, allowNewSheets: like.isNew }
  const staged = isStaged(opts)
  const start = (): Bin[] =>
    like.isNew ? [] : [{ ...like, free: [{ ...like.region }], placements: [], cuts: [], staged: undefined }]
  // The same orders and ways of cutting the plan itself used: the usual ones, or the strip layout's own.
  // A strip layout is fussier about which piece goes first, so beyond its own orders it also tries a few
  // fixed pseudo-random ones (the same every time).
  const orders = staged
    ? [...stagedOrders(opts.layout as 'length' | 'width'), ...seededOrders(6, items.length)]
    : ORDERS
  const ways: Array<(sorted: Item[]) => Packed> = staged
    ? ([0, 1] as StagedVariant[]).map((v) => (sorted: Item[]) => runStaged(sorted, start(), o, v))
    : (['across', 'best', 'down'] as SplitPolicy[]).map((p) => (sorted: Item[]) => runPack(sorted, start(), o, p))
  for (const order of orders) {
    for (const way of ways) {
      if (budget) {
        if (budget.runs <= 0) break
        budget.runs -= 1
      }
      const r = way([...items].sort(order))
      const bin = r.bins[0]
      if (r.unplaced.length > 0 || r.bins.length !== 1 || bin.placements.length !== items.length) continue
      if (!best || biggestFree(bin) > biggestFree(best) + EPS) best = bin
      // Asking only "does it all fit?", the first layout that does is enough.
      if (firstFit) break
    }
    if (firstFit && best) break
  }
  // A new sheet that no usual order manages is tried exactly (a small search, quick for the few pieces on one sheet).
  if (!best && !staged && like.isNew && (!budget || budget.runs > 0)) {
    if (budget) budget.runs -= 20
    const layouts = exactSheetLayouts(
      items.map((i) => ({ n: i.n, type: i.pieceId, w: i.w, h: i.h })),
      { sheetW: opts.sheetW, sheetH: opts.sheetH, kerf: opts.kerf, maxWork: 120_000, noTurn: Boolean(opts.grain) },
    )
    if (layouts && layouts.length === 1) {
      const mine = new Map<string, Item[]>()
      for (const i of items) mine.set(i.pieceId, [...(mine.get(i.pieceId) ?? []), i])
      best = binFromLayout(layouts[0].tree, mine, opts)
    }
  }
  // A strip layout whose usual runs all missed gets the slower search over every place each piece could go
  // (only for the handful of pieces of one sheet).
  if (!best && staged && items.length <= 12 && (!budget || budget.runs > 0)) {
    if (budget) budget.runs -= 40
    best = stagedFitAll(items, like, opts)
  }
  if (!best) return null
  best.sheetId = like.sheetId
  best.sheetDate = like.sheetDate
  return best
}

const placedArea = (b: Bin) => b.placements.reduce((a, p) => a + p.w * p.h, 0)

/**
 * Fills earlier sheets first. A piece sitting on a later new sheet moves to the earliest sheet that can take
 * it, and the sheet it left is laid out again without it. A sheet takes it in one of two ways, tried in this
 * order: the piece fits a free space the sheet already has (as typed first, then turned; the smallest fitting
 * space, R3), or the sheet is laid out again with the piece added, so free spaces that are cut apart in the
 * first layout (a strip above another strip, say) join into one big enough. A move is made only when every
 * piece on both sheets still fits its own sheet, so the plan is never longer, and an emptied sheet
 * disappears. A sheet that uses a saved leftover never gives pieces up (R2). It repeats until nothing can
 * move; every move goes to an earlier sheet, so it stops. Afterwards the new sheets are put fullest first.
 */
function consolidate(bins: Bin[], pieces: Piece[], opts: PackOptions): Bin[] {
  const all = new Map(expandPieces(pieces).map((i) => [i.n, i]))
  // Saved leftovers that nothing was put in yet stay in the list: a piece on a later new sheet may fit one
  // (turned, say, when the plan put it unturned on an open sheet first), and a leftover is always better used.
  let list = bins.filter((b) => b.placements.length > 0 || !b.isNew)
  const k = opts.kerf
  // Laying a sheet out again costs a little, so the number of tries is capped (the same for every run) and a
  // combination that failed once is not tried twice.
  let tries = 0
  // The work spent laying sheets out again, in plan runs: the same for every run of the same job.
  const budget = { runs: isStaged(opts) ? MAX_RELAYOUT_RUNS_STAGED : MAX_RELAYOUT_RUNS }
  const failed = new Set<string>()
  const sig = (b: Bin) => `${b.sheetId}:${b.placements.map((p) => p.n).sort((x, y) => x - y).join(',')}`
  const inflated = (w: number, h: number) => (w + k) * (h + k)
  // Whether a sheet already has room for a piece, and how to put it there (never turned on a grained sheet).
  const probe = (to: Bin, item: Item): { apply: () => void } | null => {
    if (isStaged(opts)) return stagedProbe(to, item, opts)
    let slot = bestFree([to], item.w, item.h)
    let turned = false
    if (!slot && !to.grain) {
      slot = bestFree([to], item.h, item.w)
      turned = true
    }
    if (!slot) return null
    const found = slot
    const w = turned ? item.h : item.w
    const h = turned ? item.w : item.h
    return { apply: () => place(to, found.idx, item, turned, k, chooseSplit('best', to.free[found.idx], w, h, k)) }
  }

  for (let pass = 0; pass < 6; pass++) {
    let any = false
    for (let moves = 0; moves < 1000; moves++) {
      let moved = false
      search: for (let j = list.length - 1; j >= 1; j--) {
        const from = list[j]
        if (!from.isNew) continue
        const order = [...from.placements].sort((a, b) => b.w * b.h - a.w * a.h || a.n - b.n)
        for (const p of order) {
          const item = all.get(p.n)!
          const rest = from.placements.filter((q) => q !== p).map((q) => all.get(q.n)!)
          let relaidFrom: Bin | null | undefined
          const sourceAfter = () => {
            if (relaidFrom === undefined) relaidFrom = rest.length > 0 ? relayoutIn(rest, from, opts, null) : null
            return rest.length === 0 || relaidFrom !== null
          }
          for (let i = 0; i < j; i++) {
            const to = list[i]
            // 1. A free space the sheet already has: as typed first, then turned.
            const fit = probe(to, item)
            if (fit) {
              if (!sourceAfter()) continue
              fit.apply()
              if (relaidFrom) list[j] = relaidFrom
              else list.splice(j, 1)
              moved = true
              break search
            }
            // 2. The sheet laid out again with the piece added (only when the room is there at all).
            if (tries >= MAX_RELAYOUTS) continue
            const room = to.region.w * to.region.h - to.placements.reduce((a, q) => a + inflated(q.w, q.h), 0)
            if (room + EPS < inflated(item.w, item.h)) continue
            const key = `${sig(to)}+${item.pieceId}`
            if (failed.has(key)) continue
            tries += 1
            const grown = relayoutIn([...to.placements.map((q) => all.get(q.n)!), item], to, opts, budget, true)
            if (!grown) {
              failed.add(key)
              continue
            }
            if (!sourceAfter()) continue
            list[i] = grown
            if (relaidFrom) list[j] = relaidFrom
            else list.splice(j, 1)
            moved = true
            break search
          }
        }
      }
      if (!moved) break
      any = true
    }
    // New sheets fullest first: a piece moved out of a middle sheet can leave it emptier than the last one.
    const keep = list.filter((b) => !b.isNew)
    const fresh = list.filter((b) => b.isNew)
    const sorted = [...fresh].sort((a, b) => placedArea(b) - placedArea(a))
    const reordered = sorted.some((b, i) => b !== fresh[i])
    list = [...keep, ...sorted]
    if (!any && !reordered) break
    if (!reordered && !any) break
  }
  return list
}

/**
 * Plans the job in several piece orders and keeps the one that needs the fewest new sheets (ties go to
 * the earlier order, so the usual largest-first plan is kept unless another is genuinely better). Each
 * order still follows R2-R5 piece by piece, so a saved leftover is always preferred over a new sheet.
 * Then the exact search and the earlier-sheets-first pass improve what can be improved.
 */
export function packJob(
  pieces: Piece[],
  stock: Leftover[],
  opts: PackOptions,
  excludedIds: ReadonlySet<string> = new Set(),
  sheetLetters: ReadonlyMap<string, Set<string>> = new Map(),
): PackResult {
  let best: Packed | null = null
  let bestScore: [number, number, number] | null = null
  const consider = (r: Packed, strict: boolean) => {
    const sc = scoreOf(r, opts)
    // A job that fits one sheet keeps the plan with the biggest single leftover (pieces stacked in one column
    // leave one big strip a later job can use, not an L-shape); the earlier plan wins every tie. Bigger jobs
    // keep the older rule: `strict` plans only win with fewer sheets.
    const single = r.bins.filter((b) => b.placements.length > 0).length <= 1
    const better = !bestScore
      ? true
      : strict && !single
        ? sc[0] < bestScore[0] || (sc[0] === bestScore[0] && sc[1] < bestScore[1])
        : sc[0] < bestScore[0] || (sc[0] === bestScore[0] && (sc[1] < bestScore[1] || (sc[1] === bestScore[1] && sc[2] < bestScore[2] - EPS)))
    if (better) {
      best = r
      bestScore = sc
    }
  }
  const staged = isStaged(opts)
  if (staged) {
    // Strip layouts: pieces of the same width (or height) together, tried in several orders and two ways of choosing a place.
    for (const order of stagedOrders(opts.layout as 'length' | 'width')) {
      for (const variant of [0, 1] as StagedVariant[]) {
        consider(packStagedInOrder(pieces, stock, opts, excludedIds, order, variant), false)
      }
    }
  } else {
    for (const order of ORDERS) consider(packInOrder(pieces, stock, opts, excludedIds, order, 'across'), false)
    // The usual cut order is kept unless dividing the free sheet the other way needs fewer sheets (or places
    // a piece that otherwise does not fit): a long piece beside a tall strip is where it matters.
    for (const policy of ['best', 'down'] as const) {
      for (const order of ORDERS) consider(packInOrder(pieces, stock, opts, excludedIds, order, policy), true)
    }
  }
  // More piece orders, tried in a fixed pseudo-random sequence (the same job always gives the same plan).
  // A plain size order can miss a layout that needs a small piece placed early; trying many orders finds
  // it. The work is capped by the job's size, so a 100-piece job is still planned in well under a second.
  const itemCount = pieces.reduce((n, p) => n + p.qty, 0)
  const runs = Math.max(0, Math.min(EXTRA_RUNS, Math.floor(EXTRA_WORK / Math.max(1, itemCount * itemCount))))
  let seed = 0x9e3779b9
  const rnd = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
  const POLICIES: SplitPolicy[] = ['across', 'best', 'down']
  for (let k = 0; k < runs; k++) {
    // Half the runs only shake a size order a little; half are fully random.
    const noise = k % 2 === 0 ? 0.6 : 10
    const keys = Array.from({ length: itemCount + 1 }, () => rnd())
    const order: ItemOrder = (a, b) => b.w * b.h * (1 + noise * keys[b.n]) - a.w * a.h * (1 + noise * keys[a.n]) || a.n - b.n
    consider(
      staged
        ? packStagedInOrder(pieces, stock, opts, excludedIds, order, (k % 2) as StagedVariant)
        : packInOrder(pieces, stock, opts, excludedIds, order, POLICIES[k % POLICIES.length]),
      true,
    )
  }
  const improved = improveNewSheets(best!, pieces, opts)
  const bins = consolidate(improved.bins, pieces, opts)
  const unplaced = [...improved.unplaced].sort((a, b) => a.n - b.n)
  return { sheets: buildSheets(bins, opts, sheetLetters), unplaced }
}

/** Turns finished bins into sheet plans: the leftovers that are kept (with their letters), the cut steps and the cut lines. */
function buildSheets(
  bins: Bin[],
  opts: PackOptions,
  sheetLetters: ReadonlyMap<string, Set<string>>,
): SheetPlan[] {
  const used = new Map<string, Set<string>>()
  const lettersFor = (sheetId: string) => {
    let set = used.get(sheetId)
    if (!set) {
      set = new Set(sheetLetters.get(sheetId) ?? [])
      used.set(sheetId, set)
    }
    return set
  }

  const sheets: SheetPlan[] = []
  for (const bin of bins) {
    if (bin.placements.length === 0) continue

    const keep = bin.free
      .filter((f) => Math.min(f.w, f.h) >= opts.minLeftover - EPS)
      .sort((a, b) => b.w * b.h - a.w * a.h)

    const letters = lettersFor(bin.sheetId)
    const newLeftovers: LeftoverRect[] = keep.map((f) => ({
      id: uid(),
      x: f.x,
      y: f.y,
      w: f.w,
      h: f.h,
      letter: nextLetter(letters, bin.leftover?.letter),
    }))

    sheets.push({
      sheetId: bin.sheetId,
      sheetW: bin.sheetW,
      sheetH: bin.sheetH,
      sheetDate: bin.sheetDate,
      isNew: bin.isNew,
      ...(bin.grain ? { grain: true } : {}),
      usedLeftoverId: bin.leftover?.id,
      usedLetter: bin.leftover?.letter,
      region: bin.region,
      placements: bin.placements,
      newLeftovers,
      steps: buildSteps(bin),
      cuts: buildCuts(bin),
    })
  }

  return sheets
}

/** The saved leftovers a plan may use, smallest first, each as a place to put pieces. */
function leftoverBinsFor(stock: Leftover[], excludedIds: ReadonlySet<string>, opts: PackOptions): Bin[] {
  return stock
    .filter((l) => l.status === 'free' && !excludedIds.has(l.id))
    .sort((a, b) => a.w * a.h - b.w * b.h)
    .map((l) => ({
      sheetId: l.sheetId,
      sheetW: l.sheetW,
      sheetH: l.sheetH,
      sheetDate: l.sheetDate,
      isNew: false,
      // A job with grain never turns a piece, whatever the leftover was cut from; a grained leftover is never turned into.
      grain: Boolean(l.grain) || Boolean(opts.grain),
      leftover: l,
      region: { x: l.x, y: l.y, w: l.w, h: l.h },
      free: [{ x: l.x, y: l.y, w: l.w, h: l.h }],
      placements: [],
      cuts: [],
    }))
}

/** The everyday plan for one piece order and one way of dividing free space. */
function packInOrder(
  pieces: Piece[],
  stock: Leftover[],
  opts: PackOptions,
  excludedIds: ReadonlySet<string>,
  order: ItemOrder,
  policy: SplitPolicy,
): Packed {
  return runPack(expandPieces(pieces).sort(order), leftoverBinsFor(stock, excludedIds, opts), opts, policy)
}

/** The strip-layout plan for one piece order and one way of choosing a place. */
function packStagedInOrder(
  pieces: Piece[],
  stock: Leftover[],
  opts: PackOptions,
  excludedIds: ReadonlySet<string>,
  order: ItemOrder,
  variant: StagedVariant,
): Packed {
  return runStaged(expandPieces(pieces).sort(order), leftoverBinsFor(stock, excludedIds, opts), opts, variant)
}

/** Places the pieces one after another, in the order given, into the bins (saved leftovers) and then new sheets. */
function runPack(items: Item[], leftoverBins: Bin[], opts: PackOptions, policy: SplitPolicy): Packed {
  const newBins: Bin[] = []
  const unplaced: Item[] = []

  const openSheet = (): Bin => {
    const bin: Bin = {
      sheetId: uid(),
      sheetW: opts.sheetW,
      sheetH: opts.sheetH,
      sheetDate: Date.now(),
      isNew: true,
      grain: Boolean(opts.grain),
      region: { x: 0, y: 0, w: opts.sheetW, h: opts.sheetH },
      free: [{ x: 0, y: 0, w: opts.sheetW, h: opts.sheetH }],
      placements: [],
      cuts: [],
    }
    newBins.push(bin)
    return bin
  }

  const allowNewSheets = opts.allowNewSheets ?? true

  for (const item of items) {
    const tries: Array<[Bin[], boolean]> = [
      [leftoverBins, false],
      [newBins, false],
      // A grained sheet keeps its lines running top to bottom: nothing is ever turned on it.
      [leftoverBins.filter((b) => !b.grain), true],
      [newBins.filter((b) => !b.grain), true],
    ]
    let done = false
    for (const [bins, rotated] of tries) {
      const w = rotated ? item.h : item.w
      const h = rotated ? item.w : item.h
      const slot = bestFree(bins, w, h)
      if (slot) {
        place(slot.bin, slot.idx, item, rotated, opts.kerf, chooseSplit(policy, slot.bin.free[slot.idx], w, h, opts.kerf))
        done = true
        break
      }
    }
    if (done) continue

    if (!allowNewSheets) {
      unplaced.push(item)
    } else if (fits({ x: 0, y: 0, w: opts.sheetW, h: opts.sheetH }, item.w, item.h)) {
      const bin = openSheet()
      place(bin, 0, item, false, opts.kerf, chooseSplit(policy, bin.free[0], item.w, item.h, opts.kerf))
    } else if (!opts.grain && fits({ x: 0, y: 0, w: opts.sheetW, h: opts.sheetH }, item.h, item.w)) {
      const bin = openSheet()
      place(bin, 0, item, true, opts.kerf, chooseSplit(policy, bin.free[0], item.h, item.w, opts.kerf))
    } else {
      unplaced.push(item)
    }
  }

  return { bins: [...leftoverBins, ...newBins], unplaced }
}
