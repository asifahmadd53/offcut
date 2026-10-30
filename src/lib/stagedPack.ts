import { uid } from './id'
import { rotateTape } from './tape'
import type { Bin, CutLine, Item, Packed, PackOptions } from './packer'
import type { LayoutMethod, Placed, Rect } from './types'

/**
 * Strip layouts: the way a panel saw cuts a sheet in rounds, instead of any edge-to-edge layout.
 *
 *  - "First cut along the length" ('length'): round 1 cuts the whole length of the sheet into long strips.
 *    Round 2 cuts each strip across into cells. With 3 rounds, round 3 cuts a cell down into pieces
 *    (the same direction as round 1), so a strip can hold pieces of different widths.
 *  - "First cut along the width" ('width'): the same, turned a quarter: round 1 cuts the whole width into
 *    wide strips, round 2 cuts each strip down, round 3 cuts a cell across.
 *
 * With 2 rounds every piece in a strip must be exactly as wide as the strip (the pieces of one strip are
 * cut off one after another); with 3 rounds a cell holds pieces of one height side by side and what is
 * left beside them is a leftover.
 *
 * Everything here is written once, for strips that run along the "b" axis and are laid side by side along
 * the "a" axis. For 'length' that is (a, b) = (x, y); for 'width' it is (a, b) = (y, x).
 */

const EPS = 1e-6
const r4 = (n: number) => Math.round(n * 1e4) / 1e4

export interface StagedPiece {
  a0: number
  pa: number
}

export interface StagedCell {
  b0: number
  b: number
  pieces: StagedPiece[]
}

export interface StagedStrip {
  a0: number
  a: number
  cells: StagedCell[]
}

export interface StagedState {
  method: Exclude<LayoutMethod, 'normal'>
  levels: 2 | 3
  /** The region's size across the strips (a) and along them (b), and its corner on the sheet. */
  A: number
  B: number
  x0: number
  y0: number
  strips: StagedStrip[]
}

export const isStaged = (opts: PackOptions) => opts.layout === 'length' || opts.layout === 'width'

export function newStaged(opts: PackOptions, region: Rect): StagedState {
  const method = opts.layout as Exclude<LayoutMethod, 'normal'>
  return {
    method,
    levels: opts.levels ?? 2,
    A: method === 'length' ? region.w : region.h,
    B: method === 'length' ? region.h : region.w,
    x0: region.x,
    y0: region.y,
    strips: [],
  }
}

/** A piece's size across the strips (pa) and along them (pb), for the way it lies on the sheet. */
function dims(st: StagedState, item: Item, turned: boolean): { pa: number; pb: number } {
  const w = turned ? item.h : item.w
  const h = turned ? item.w : item.h
  return st.method === 'length' ? { pa: w, pb: h } : { pa: h, pb: w }
}

/** A box given in strip terms, as a rectangle on the sheet. */
function toRect(st: StagedState, a0: number, b0: number, la: number, lb: number): Rect {
  return st.method === 'length'
    ? { x: r4(st.x0 + a0), y: r4(st.y0 + b0), w: r4(la), h: r4(lb) }
    : { x: r4(st.x0 + b0), y: r4(st.y0 + a0), w: r4(lb), h: r4(la) }
}

/** Where on the sheet a position along a strip axis lies. */
const posA = (st: StagedState, a: number) => r4((st.method === 'length' ? st.x0 : st.y0) + a)
const posB = (st: StagedState, b: number) => r4((st.method === 'length' ? st.y0 : st.x0) + b)

const lastEndA = (strip: StagedStrip) => strip.a0 + strip.a

/**
 * How wide a strip may be. The last strip can still grow (nothing lies beyond it yet), up to the end of the
 * region; every other strip is already as wide as it will be.
 */
const roomA = (st: StagedState, si: number) => (si === st.strips.length - 1 ? st.A - st.strips[si].a0 : st.strips[si].a)
const cellEndB = (cell: StagedCell) => cell.b0 + cell.b
const cellEndA = (cell: StagedCell) => {
  const last = cell.pieces[cell.pieces.length - 1]
  return last.a0 + last.pa
}

/** Every free area the strips leave: past the last strip, under each strip's cells, and beside the pieces of a cell. */
function freeOf(st: StagedState, kerf: number): Rect[] {
  const out: Rect[] = []
  const add = (a0: number, b0: number, la: number, lb: number) => {
    if (la > EPS && lb > EPS) out.push(toRect(st, a0, b0, la, lb))
  }
  const afterStrips = st.strips.length > 0 ? lastEndA(st.strips[st.strips.length - 1]) + kerf : 0
  add(afterStrips, 0, st.A - afterStrips, st.B)
  for (const strip of st.strips) {
    const stripEnd = strip.a0 + strip.a
    const last = strip.cells[strip.cells.length - 1]
    const below = cellEndB(last) + kerf
    add(strip.a0, below, strip.a, st.B - below)
    if (st.levels === 3) {
      for (const cell of strip.cells) {
        const beside = cellEndA(cell) + kerf
        add(beside, cell.b0, stripEnd - beside, cell.b)
      }
    }
  }
  return out
}

/**
 * The saw cuts of these strips, in the order they are made: every cut of round 1 first, then, strip by
 * strip, the cuts of round 2 and (with 3 rounds) round 3.
 */
function cutsOf(st: StagedState): CutLine[] {
  const length = st.method === 'length'
  const kindFirst = length ? 'down' : 'across'
  const kindSecond = length ? 'across' : 'down'
  const region: Rect = length ? { x: st.x0, y: st.y0, w: st.A, h: st.B } : { x: st.x0, y: st.y0, w: st.B, h: st.A }
  const cuts: CutLine[] = []

  for (const strip of st.strips) {
    const end = strip.a0 + strip.a
    if (end < st.A - EPS) {
      cuts.push({ kind: kindFirst, pos: posA(st, end), rect: region, span: { from: posB(st, 0), to: posB(st, st.B) } })
    }
  }
  for (const strip of st.strips) {
    const stripRect = toRect(st, strip.a0, 0, strip.a, st.B)
    for (const cell of strip.cells) {
      const end = cellEndB(cell)
      if (end < st.B - EPS) {
        cuts.push({
          kind: kindSecond,
          pos: posB(st, end),
          rect: stripRect,
          span: { from: posA(st, strip.a0), to: posA(st, strip.a0 + strip.a) },
        })
      }
    }
    if (st.levels === 3) {
      const stripEnd = strip.a0 + strip.a
      for (const cell of strip.cells) {
        const cellRect = toRect(st, strip.a0, cell.b0, strip.a, cell.b)
        for (const piece of cell.pieces) {
          const end = piece.a0 + piece.pa
          if (end < stripEnd - EPS) {
            cuts.push({
              kind: kindFirst,
              pos: posA(st, end),
              rect: cellRect,
              span: { from: posB(st, cell.b0), to: posB(st, cell.b0 + cell.b) },
            })
          }
        }
      }
    }
  }
  return cuts
}

/** Brings a bin's free areas and cut lines in step with its strips. */
function refresh(bin: Bin, kerf: number) {
  const st = bin.staged!
  bin.free = freeOf(st, kerf)
  bin.cuts = cutsOf(st)
}

/** Where a piece could go in one bin's strips, best kind first: beside a piece of the same height, under a strip's cells, or as a new strip. */
interface Slot {
  /** 0: joins a cell, 1: a new cell in a strip, 2: a new strip. */
  kind: 0 | 1 | 2
  slack: number
  slack2: number
  strip: number
  cell: number
  turned: boolean
  /** Where the piece goes, in strip terms. */
  a0: number
  b0: number
  pa: number
  pb: number
}

function findSlot(st: StagedState, item: Item, turned: boolean, kerf: number): Slot | null {
  const { pa, pb } = dims(st, item, turned)
  if (pb > st.B + EPS || pa > st.A + EPS) return null
  let best: Slot | null = null
  const consider = (c: Slot) => {
    if (
      !best ||
      c.kind < best.kind ||
      (c.kind === best.kind && (c.slack < best.slack - EPS || (Math.abs(c.slack - best.slack) <= EPS && c.slack2 < best.slack2 - EPS)))
    ) {
      best = c
    }
  }
  st.strips.forEach((strip, si) => {
    const stripEnd = strip.a0 + roomA(st, si)
    // A cell of the same height with room beside its pieces (3 rounds only).
    if (st.levels === 3) {
      strip.cells.forEach((cell, ci) => {
        if (Math.abs(cell.b - pb) > EPS) return
        const startA = cellEndA(cell) + kerf
        const room = stripEnd - startA
        if (pa <= room + EPS) {
          consider({ kind: 0, slack: room - pa, slack2: 0, strip: si, cell: ci, turned, a0: startA, b0: cell.b0, pa, pb })
        }
      })
    }
    // A new cell under the strip's last cell: as wide as the strip (2 rounds), or no wider (3 rounds; the last strip may grow).
    const widthOk = st.levels === 3 ? pa <= roomA(st, si) + EPS : Math.abs(pa - strip.a) <= EPS
    const last = strip.cells[strip.cells.length - 1]
    const b0 = cellEndB(last) + kerf
    if (widthOk && pb <= st.B - b0 + EPS) {
      consider({ kind: 1, slack: Math.abs(strip.a - pa), slack2: st.B - b0 - pb, strip: si, cell: -1, turned, a0: strip.a0, b0, pa, pb })
    }
  })
  // A new strip after the last one.
  const startA = st.strips.length > 0 ? lastEndA(st.strips[st.strips.length - 1]) + kerf : 0
  if (pa <= st.A - startA + EPS) {
    consider({ kind: 2, slack: st.A - startA - pa, slack2: st.B - pb, strip: -1, cell: -1, turned, a0: startA, b0: 0, pa, pb })
  }
  return best
}

function applySlot(bin: Bin, item: Item, slot: Slot, kerf: number) {
  const st = bin.staged!
  const piece: StagedPiece = { a0: slot.a0, pa: slot.pa }
  if (slot.kind === 0) {
    st.strips[slot.strip].cells[slot.cell].pieces.push(piece)
  } else if (slot.kind === 1) {
    st.strips[slot.strip].cells.push({ b0: slot.b0, b: slot.pb, pieces: [piece] })
  } else {
    st.strips.push({ a0: slot.a0, a: slot.pa, cells: [{ b0: 0, b: slot.pb, pieces: [piece] }] })
  }
  const at = toRect(st, slot.a0, slot.b0, slot.pa, slot.pb)
  const placed: Placed = {
    x: at.x,
    y: at.y,
    w: at.w,
    h: at.h,
    n: item.n,
    pieceId: item.pieceId,
    label: item.label,
    ...(item.labelUnit ? { labelUnit: item.labelUnit } : {}),
    rotated: slot.turned,
    tape: slot.turned ? rotateTape(item.tape) : item.tape,
  }
  growStrip(st, slot)
  bin.placements.push(placed)
  refresh(bin, kerf)
}

/** The last strip is as wide as its widest piece reaches. */
function growStrip(st: StagedState, slot: Slot) {
  if (slot.kind === 2) return
  const strip = st.strips[slot.strip]
  strip.a = Math.max(strip.a, slot.a0 + slot.pa - strip.a0)
}

/** Gives a bin its (empty) strips the first time it is used. */
function ensure(bin: Bin, opts: PackOptions) {
  if (!bin.staged) {
    bin.staged = newStaged(opts, bin.region)
    bin.free = freeOf(bin.staged, opts.kerf)
    bin.cuts = []
  }
}

/** A way of choosing between the places a piece fits: 0 = the tightest fit over every sheet, 1 = the first sheet that takes it. */
export type StagedVariant = 0 | 1

function pick(bins: Bin[], item: Item, turned: boolean, opts: PackOptions, variant: StagedVariant): { bin: Bin; slot: Slot } | null {
  let best: { bin: Bin; slot: Slot } | null = null
  for (const bin of bins) {
    if (turned && bin.grain) continue
    ensure(bin, opts)
    const slot = findSlot(bin.staged!, item, turned, opts.kerf)
    if (!slot) continue
    if (variant === 1) return { bin, slot }
    if (
      !best ||
      slot.kind < best.slot.kind ||
      (slot.kind === best.slot.kind && (slot.slack < best.slot.slack - EPS || (Math.abs(slot.slack - best.slot.slack) <= EPS && slot.slack2 < best.slot.slack2 - EPS)))
    ) {
      best = { bin, slot }
    }
  }
  return best
}

/**
 * Whether one bin can take this piece in its strips (as typed, else turned when the sheet has no grain),
 * and how. Nothing is changed until `apply` is called.
 */
export function stagedProbe(bin: Bin, item: Item, opts: PackOptions): { turned: boolean; apply: () => void } | null {
  ensure(bin, opts)
  const asTyped = findSlot(bin.staged!, item, false, opts.kerf)
  if (asTyped) return { turned: false, apply: () => applySlot(bin, item, asTyped, opts.kerf) }
  if (bin.grain) return null
  const turned = findSlot(bin.staged!, item, true, opts.kerf)
  if (!turned) return null
  return { turned: true, apply: () => applySlot(bin, item, turned, opts.kerf) }
}

/** The piece orders a strip layout tries: the strips want pieces of the same width (or height) together. */
export function stagedOrders(method: Exclude<LayoutMethod, 'normal'>): Array<(a: Item, b: Item) => number> {
  const major = (i: Item) => (method === 'length' ? i.w : i.h)
  const minor = (i: Item) => (method === 'length' ? i.h : i.w)
  return [
    (a, b) => major(b) - major(a) || minor(b) - minor(a) || a.n - b.n,
    (a, b) => b.w * b.h - a.w * a.h || major(b) - major(a) || a.n - b.n,
    (a, b) => minor(b) - minor(a) || major(b) - major(a) || a.n - b.n,
    (a, b) => major(a) - major(b) || minor(b) - minor(a) || a.n - b.n,
  ]
}

/**
 * Places the pieces one after another, in the order given, into the saved leftovers and then new sheets,
 * every sheet cut in strips. The same preference as the normal layout: a saved leftover before a new sheet,
 * as typed before turned (and never turned on a grained sheet).
 */
export function runStaged(items: Item[], leftoverBins: Bin[], opts: PackOptions, variant: StagedVariant): Packed {
  const newBins: Bin[] = []
  const unplaced: Item[] = []
  const allowNewSheets = opts.allowNewSheets ?? true
  for (const b of leftoverBins) ensure(b, opts)

  const openSheet = (): Bin => {
    const region = { x: 0, y: 0, w: opts.sheetW, h: opts.sheetH }
    const bin: Bin = {
      sheetId: uid(),
      sheetW: opts.sheetW,
      sheetH: opts.sheetH,
      sheetDate: Date.now(),
      isNew: true,
      grain: Boolean(opts.grain),
      region,
      free: [region],
      placements: [],
      cuts: [],
    }
    ensure(bin, opts)
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
    for (const [bins, turned] of tries) {
      const found = pick(bins, item, turned, opts, variant)
      if (found) {
        applySlot(found.bin, item, found.slot, opts.kerf)
        done = true
        break
      }
    }
    if (done) continue
    if (!allowNewSheets) {
      unplaced.push(item)
      continue
    }
    // A new sheet: as typed if it fits, else turned (never on a grained sheet).
    const asTyped = dims(newStagedFor(opts), item, false)
    const turnedDims = dims(newStagedFor(opts), item, true)
    const A = opts.layout === 'length' ? opts.sheetW : opts.sheetH
    const B = opts.layout === 'length' ? opts.sheetH : opts.sheetW
    if (asTyped.pa <= A + EPS && asTyped.pb <= B + EPS) {
      const bin = openSheet()
      applySlot(bin, item, findSlot(bin.staged!, item, false, opts.kerf)!, opts.kerf)
    } else if (!opts.grain && turnedDims.pa <= A + EPS && turnedDims.pb <= B + EPS) {
      const bin = openSheet()
      applySlot(bin, item, findSlot(bin.staged!, item, true, opts.kerf)!, opts.kerf)
    } else {
      unplaced.push(item)
    }
  }
  return { bins: [...leftoverBins, ...newBins], unplaced }
}

const newStagedFor = (opts: PackOptions) => newStaged(opts, { x: 0, y: 0, w: opts.sheetW, h: opts.sheetH })

/** A copy of the strips, so a try can be thrown away. */
function cloneState(st: StagedState): StagedState {
  return {
    ...st,
    strips: st.strips.map((s) => ({
      ...s,
      cells: s.cells.map((c) => ({ ...c, pieces: c.pieces.map((p) => ({ ...p })) })),
    })),
  }
}

/** Every place a piece could go in these strips (not just the best one), best kind and tightest fit first. */
function allSlots(st: StagedState, item: Item, turned: boolean, kerf: number): Slot[] {
  const { pa, pb } = dims(st, item, turned)
  if (pb > st.B + EPS || pa > st.A + EPS) return []
  const out: Slot[] = []
  st.strips.forEach((strip, si) => {
    const stripEnd = strip.a0 + roomA(st, si)
    if (st.levels === 3) {
      strip.cells.forEach((cell, ci) => {
        if (Math.abs(cell.b - pb) > EPS) return
        const startA = cellEndA(cell) + kerf
        const room = stripEnd - startA
        if (pa <= room + EPS) out.push({ kind: 0, slack: room - pa, slack2: 0, strip: si, cell: ci, turned, a0: startA, b0: cell.b0, pa, pb })
      })
    }
    const widthOk = st.levels === 3 ? pa <= roomA(st, si) + EPS : Math.abs(pa - strip.a) <= EPS
    const last = strip.cells[strip.cells.length - 1]
    const b0 = cellEndB(last) + kerf
    if (widthOk && pb <= st.B - b0 + EPS) {
      out.push({ kind: 1, slack: Math.abs(strip.a - pa), slack2: st.B - b0 - pb, strip: si, cell: -1, turned, a0: strip.a0, b0, pa, pb })
    }
  })
  const startA = st.strips.length > 0 ? lastEndA(st.strips[st.strips.length - 1]) + kerf : 0
  if (pa <= st.A - startA + EPS) {
    out.push({ kind: 2, slack: st.A - startA - pa, slack2: st.B - pb, strip: -1, cell: -1, turned, a0: startA, b0: 0, pa, pb })
  }
  return out.sort((x, y) => x.kind - y.kind || x.slack - y.slack || x.slack2 - y.slack2)
}

/** Puts a slot's piece into the strips (no bin, no placements): just the strips themselves. */
function addToState(st: StagedState, slot: Slot) {
  const piece: StagedPiece = { a0: slot.a0, pa: slot.pa }
  if (slot.kind === 0) st.strips[slot.strip].cells[slot.cell].pieces.push(piece)
  else if (slot.kind === 1) st.strips[slot.strip].cells.push({ b0: slot.b0, b: slot.pb, pieces: [piece] })
  else st.strips.push({ a0: slot.a0, a: slot.pa, cells: [{ b0: 0, b: slot.pb, pieces: [piece] }] })
  growStrip(st, slot)
}

/**
 * Whether these pieces ALL fit one place (a whole sheet, or one saved leftover), cut in strips, and how.
 * The usual runs place pieces greedily and can miss a way that needs a piece to go somewhere other than
 * its tightest fit; this tries every way a piece could go, one after another, until one works or the
 * budget of tries is used up (the same budget every time, so the answer never depends on the machine).
 * Used for the few pieces of one sheet, when the sheet is laid out again.
 */
export function stagedFitAll(items: Item[], like: Bin, opts: PackOptions, nodeLimit = 6_000): Bin | null {
  const order = [...items].sort((a, b) => {
    const major = (i: Item) => (opts.layout === 'length' ? i.w : i.h)
    return major(b) - major(a) || b.w * b.h - a.w * a.h || a.n - b.n
  })
  const region = like.isNew ? { x: 0, y: 0, w: opts.sheetW, h: opts.sheetH } : like.region
  const start = newStaged(opts, region)
  let nodes = 0
  const chosen: Slot[] = []
  // What is still to be placed can never take more room than is left.
  const area = (i: Item) => (i.w + opts.kerf) * (i.h + opts.kerf)
  const restArea = order.map((_, k) => order.slice(k).reduce((a, i) => a + area(i), 0))
  const room = (region.w + opts.kerf) * (region.h + opts.kerf)

  const go = (k: number, st: StagedState, used: number): boolean => {
    if (k === order.length) return true
    if (used + restArea[k] > room + EPS) return false
    if (++nodes > nodeLimit) return false
    const item = order[k]
    for (const turned of like.grain || opts.grain ? [false] : [false, true]) {
      if (turned && Math.abs(item.w - item.h) <= EPS) continue
      for (const slot of allSlots(st, item, turned, opts.kerf)) {
        const next = cloneState(st)
        addToState(next, slot)
        chosen.push(slot)
        if (go(k + 1, next, used + area(item))) return true
        chosen.pop()
        if (nodes > nodeLimit) return false
      }
    }
    return false
  }
  if (!go(0, start, 0)) return null

  const bin: Bin = like.isNew
    ? {
        sheetId: like.sheetId,
        sheetW: opts.sheetW,
        sheetH: opts.sheetH,
        sheetDate: like.sheetDate,
        isNew: true,
        grain: Boolean(opts.grain),
        region,
        free: [region],
        placements: [],
        cuts: [],
      }
    : { ...like, free: [{ ...like.region }], placements: [], cuts: [], staged: undefined }
  ensure(bin, opts)
  order.forEach((item, k) => applySlot(bin, item, chosen[k], opts.kerf))
  return bin
}
