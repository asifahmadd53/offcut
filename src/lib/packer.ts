import { fmt } from './inches'
import { uid } from './id'
import type { Leftover, LeftoverRect, Piece, Placed, Rect, SheetPlan } from './types'

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

const EPS = 1e-6
const r4 = (n: number) => Math.round(n * 1e4) / 1e4

export interface PackOptions {
  sheetW: number
  sheetH: number
  /** Blade thickness. Use 0 when the blade toggle is off. */
  kerf: number
  /** Free areas with a side shorter than this are waste and are not saved. */
  minLeftover: number
}

export interface Item {
  /** Piece number in the job, starting at 1. */
  n: number
  pieceId: string
  w: number
  h: number
  label: string
}

export interface PackResult {
  sheets: SheetPlan[]
  unplaced: Item[]
}

interface CutLine {
  kind: 'across' | 'down'
  pos: number
  rect: Rect
}

interface Bin {
  sheetId: string
  sheetW: number
  sheetH: number
  sheetDate: number
  isNew: boolean
  leftover?: Leftover
  region: Rect
  free: Rect[]
  placements: Placed[]
  cuts: CutLine[]
}

export function expandPieces(pieces: Piece[]): Item[] {
  const items: Item[] = []
  let n = 0
  for (const p of pieces) {
    for (let i = 0; i < p.qty; i++) {
      n += 1
      items.push({ n, pieceId: p.id, w: p.w, h: p.h, label: `${fmt(p.w)} × ${fmt(p.h)}` })
    }
  }
  return items
}

const fits = (f: Rect, w: number, h: number) => w <= f.w + EPS && h <= f.h + EPS

/** Smallest free rectangle (by area) that holds the piece. */
function bestFree(bins: Bin[], w: number, h: number): { bin: Bin; idx: number } | null {
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

function place(bin: Bin, idx: number, item: Item, rotated: boolean, kerf: number) {
  const f = bin.free[idx]
  const pw = rotated ? item.h : item.w
  const ph = rotated ? item.w : item.h
  bin.free.splice(idx, 1)

  // Cut order: across first (full width), then down.
  if (f.h - ph > EPS) bin.cuts.push({ kind: 'across', pos: r4(f.y + ph), rect: f })
  if (f.w - pw > EPS) bin.cuts.push({ kind: 'down', pos: r4(f.x + pw), rect: f })

  const rightW = r4(f.w - pw - kerf)
  const bottomH = r4(f.h - ph - kerf)
  if (rightW > EPS) {
    bin.free.push({ x: r4(f.x + pw + kerf), y: f.y, w: rightW, h: ph })
  }
  if (bottomH > EPS) {
    bin.free.push({ x: f.x, y: r4(f.y + ph + kerf), w: f.w, h: bottomH })
  }

  bin.placements.push({
    x: f.x,
    y: f.y,
    w: pw,
    h: ph,
    n: item.n,
    pieceId: item.pieceId,
    label: item.label,
    rotated,
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

function buildSteps(bin: Bin): string[] {
  const seen = new Set<string>()
  return bin.cuts.map((c) => {
    const from = c.kind === 'across' ? bin.region.y : bin.region.x
    const base = `Cut ${c.kind} at ${fmt(r4(c.pos - from))} in`
    const text = seen.has(base) ? `${base} (in the ${fmt(c.rect.w)} × ${fmt(c.rect.h)} part)` : base
    seen.add(base)
    return text
  })
}

export function packJob(
  pieces: Piece[],
  stock: Leftover[],
  opts: PackOptions,
  excludedIds: ReadonlySet<string> = new Set(),
  sheetLetters: ReadonlyMap<string, Set<string>> = new Map(),
): PackResult {
  const items = expandPieces(pieces).sort(
    (a, b) => b.w * b.h - a.w * a.h || b.h - a.h || a.n - b.n,
  )

  const leftoverBins: Bin[] = stock
    .filter((l) => l.status === 'free' && !excludedIds.has(l.id))
    .sort((a, b) => a.w * a.h - b.w * b.h)
    .map((l) => ({
      sheetId: l.sheetId,
      sheetW: l.sheetW,
      sheetH: l.sheetH,
      sheetDate: l.sheetDate,
      isNew: false,
      leftover: l,
      region: { x: l.x, y: l.y, w: l.w, h: l.h },
      free: [{ x: l.x, y: l.y, w: l.w, h: l.h }],
      placements: [],
      cuts: [],
    }))

  const newBins: Bin[] = []
  const unplaced: Item[] = []

  const openSheet = (): Bin => {
    const bin: Bin = {
      sheetId: uid(),
      sheetW: opts.sheetW,
      sheetH: opts.sheetH,
      sheetDate: Date.now(),
      isNew: true,
      region: { x: 0, y: 0, w: opts.sheetW, h: opts.sheetH },
      free: [{ x: 0, y: 0, w: opts.sheetW, h: opts.sheetH }],
      placements: [],
      cuts: [],
    }
    newBins.push(bin)
    return bin
  }

  for (const item of items) {
    const tries: Array<[Bin[], boolean]> = [
      [leftoverBins, false],
      [newBins, false],
      [leftoverBins, true],
      [newBins, true],
    ]
    let done = false
    for (const [bins, rotated] of tries) {
      const w = rotated ? item.h : item.w
      const h = rotated ? item.w : item.h
      const slot = bestFree(bins, w, h)
      if (slot) {
        place(slot.bin, slot.idx, item, rotated, opts.kerf)
        done = true
        break
      }
    }
    if (done) continue

    if (fits({ x: 0, y: 0, w: opts.sheetW, h: opts.sheetH }, item.w, item.h)) {
      const bin = openSheet()
      place(bin, 0, item, false, opts.kerf)
    } else if (fits({ x: 0, y: 0, w: opts.sheetW, h: opts.sheetH }, item.h, item.w)) {
      const bin = openSheet()
      place(bin, 0, item, true, opts.kerf)
    } else {
      unplaced.push(item)
    }
  }

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
  for (const bin of [...leftoverBins, ...newBins]) {
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
      usedLeftoverId: bin.leftover?.id,
      usedLetter: bin.leftover?.letter,
      region: bin.region,
      placements: bin.placements,
      newLeftovers,
      steps: buildSteps(bin),
    })
  }

  unplaced.sort((a, b) => a.n - b.n)
  return { sheets, unplaced }
}
