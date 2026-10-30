const r4 = (n: number) => Math.round(n * 1e4) / 1e4

/**
 * The unit sizes are typed and shown in. Everything the planner works with stays in inches (R1); a unit
 * only changes how a size is read from the user and written back. Inches is the default, and with it
 * every function here behaves exactly as it did before units existed.
 */
export type Unit = 'in' | 'ft' | 'cm' | 'mm'
export const UNITS: Unit[] = ['in', 'ft', 'cm', 'mm']
export const UNIT_NAME: Record<Unit, string> = { in: 'Inches', ft: 'Feet', cm: 'Centimetres', mm: 'Millimetres' }
/** How many of the unit there are in one inch. */
const PER_INCH: Record<Unit, number> = { in: 1, ft: 1 / 12, cm: 2.54, mm: 25.4 }
/** Decimal places a size is shown with in each unit (inches use fractions or two places). */
const PLACES: Record<Unit, number> = { in: 2, ft: 4, cm: 2, mm: 2 }

let currentUnit: Unit = 'in'
/** Set from Settings when it loads or changes; the whole app then reads and writes sizes in this unit. */
export function setDisplayUnit(u: Unit | undefined) {
  currentUnit = u && u in PER_INCH ? u : 'in'
}
export const getDisplayUnit = (): Unit => currentUnit
/** The short name written after a size: in, ft, cm, mm. */
export const unitLabel = (u: Unit = currentUnit): string => u

const roundTo = (n: number, places: number) => {
  const k = 10 ** places
  return Math.round(n * k) / k
}

/** A length in inches as a number in the unit (not rounded). */
export const inchesTo = (inches: number, u: Unit = currentUnit): number => inches * PER_INCH[u]

/** A size (inches) written in a unit, without the unit name: 48, 121.92, 1219.2, 4. Inches use fractions via `fmt`. */
export function fmtIn(inches: number, u: Unit): string {
  if (u === 'in') return fmtInches(inches)
  return String(roundTo(inchesTo(inches, u), PLACES[u]))
}

/** Square inches written as an area in the unit's square: 4608 sq in, 29728 sq cm, 32 sq ft. */
export function fmtArea(sqIn: number, u: Unit = currentUnit): string {
  const k = PER_INCH[u] ** 2
  // Square feet are small numbers (a 20 sq in leftover is 0.14 sq ft), so they keep two places.
  return u === 'ft' ? roundTo(sqIn * k, 2).toLocaleString() : Math.round(sqIn * k).toLocaleString()
}
export const areaLabel = (u: Unit = currentUnit): string => `sq ${u}`
/** A unit name after a size where inches were never written ("48 × 96"), so inch jobs read exactly as before. */
export const unitSuffix = (u: Unit = currentUnit): string => (u === 'in' ? '' : ` ${u}`)
/** What follows a size on the drawing: the inch mark in inches, a short unit name otherwise (48" or 121.92 cm). */
export const unitMark = (u: Unit = currentUnit): string => (u === 'in' ? '"' : ` ${u}`)
/** The word used for the unit in a sentence: inches, feet, centimetres, millimetres. */
export const unitWords = (u: Unit = currentUnit): string => ({ in: 'inches', ft: 'feet', cm: 'centimetres', mm: 'millimetres' })[u]

/**
 * Reads a size typed by the user.
 * Accepts: 22, 22.5, 22 1/2, 22-1/2, 1/2, 22", 22 in
 * Returns null when the text is not a positive number.
 */
export function parseInches(input: string): number | null {
  const s = input
    .trim()
    .toLowerCase()
    .replace(/["”″]|inches|inch|in\b/g, '')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!s) return null

  let value: number | null = null
  let m: RegExpMatchArray | null

  if (/^\d+(\.\d+)?$/.test(s)) {
    value = parseFloat(s)
  } else if ((m = s.match(/^(\d+) (\d+)\/(\d+)$/))) {
    const den = Number(m[3])
    if (den > 0) value = Number(m[1]) + Number(m[2]) / den
  } else if ((m = s.match(/^(\d+)\/(\d+)$/))) {
    const den = Number(m[2])
    if (den > 0) value = Number(m[1]) / den
  }

  if (value === null || !Number.isFinite(value) || value <= 0) return null
  return r4(value)
}

/**
 * Reads a size typed by the user in the given unit (the app's unit by default) and returns inches.
 * A plain number is in that unit; a unit written after it wins: 50 cm, 1220 mm, 4 ft, 22 in, 4 ft 6 in, 4'6".
 * In inches this is exactly `parseInches`.
 */
export function parseSize(input: string, unit: Unit = currentUnit): number | null {
  const raw = input.trim().toLowerCase()
  if (!raw) return null
  // Feet and inches together: 4 ft 6 in, 4' 6", 4ft 6
  const both = raw.match(/^(.+?)\s*(?:feet|foot|ft|')\s*(.+?)\s*(?:inches|inch|in|"|”|″)?$/)
  if (both) {
    const ft = parseInches(both[1])
    const inch = parseInches(both[2])
    if (ft !== null && inch !== null) return r4(ft * 12 + inch)
    return null
  }
  const one = raw.match(/^(.*?)\s*(feet|foot|ft|'|centimetres|centimeters|cm|millimetres|millimeters|mm|inches|inch|in|"|”|″)?$/)
  if (!one) return null
  const word = one[2]
  const u: Unit = !word
    ? unit
    : /^(feet|foot|ft|')$/.test(word)
      ? 'ft'
      : /^(centi)/.test(word) || word === 'cm'
        ? 'cm'
        : /^(milli)/.test(word) || word === 'mm'
          ? 'mm'
          : 'in'
  const n = parseInches(one[1])
  if (n === null) return null
  return u === 'in' ? n : r4(n / PER_INCH[u])
}

/** Shows a size the way a carpenter reads it: 22 1/2, 3/8, 19. */
export function fmt(n: number): string {
  return currentUnit !== 'in' ? String(roundTo(inchesTo(n), PLACES[currentUnit])) : fmtInches(n)
}

/** Inches the way a carpenter reads them (22 1/2), whatever unit the app is showing. */
export function fmtInches(n: number): string {
  const sixteenths = Math.round(n * 16)
  if (Math.abs(n * 16 - sixteenths) < 0.05) {
    const whole = Math.floor(sixteenths / 16)
    let num = sixteenths % 16
    if (num === 0) return String(whole)
    let den = 16
    while (num % 2 === 0) {
      num /= 2
      den /= 2
    }
    return whole > 0 ? `${whole} ${num}/${den}` : `${num}/${den}`
  }
  return String(Math.round(n * 100) / 100)
}

/** "23 × 77" in the order it was typed (width × height). */
export const fmtDims = (w: number, h: number) => `${fmt(w)} × ${fmt(h)}`

/** Leftovers are always shown short side first: 19 × 48, 2 × 77. */
export const fmtLeft = (w: number, h: number) =>
  `${fmt(Math.min(w, h))} × ${fmt(Math.max(w, h))}`

/**
 * What the user typed for one side of a piece, tidied for display: units and extra spaces
 * dropped, nothing converted or rounded ("10.5" stays "10.5", "22 1/2" stays "22 1/2").
 */
export function cleanTyped(input: string): string {
  return input
    .trim()
    .replace(/\s*(["”″]|inches|inch|in)\s*$/i, '')
    .replace(/\s+/g, ' ')
}

/** A piece's size as it was typed (width × height); older pieces without typed text show plain decimals. */
export const pieceDims = (p: { w: number; h: number; wText?: string; hText?: string; unit?: Unit }) => {
  const f = sizeFormatter('decimal').fmt
  // What was typed is shown as typed only while the app is in the unit it was typed in; after a change of
  // unit the real size is shown in the new one.
  const typedHere = (p.unit ?? 'in') === currentUnit
  return `${typedHere ? (p.wText ?? f(p.w)) : f(p.w)} × ${typedHere ? (p.hText ?? f(p.h)) : f(p.h)}`
}

export type SizeStyle = 'fraction' | 'decimal'

export interface Formatter {
  fmt: (n: number) => string
  fmtDims: (w: number, h: number) => string
  fmtLeft: (w: number, h: number) => string
}

/**
 * How the sizes the app works out itself (leftovers, rulers, gaps) are written next to the
 * ones the user typed: plain decimals (10.5, up to two places) or fractions (10 1/2).
 */
export function sizeFormatter(style: SizeStyle = 'decimal'): Formatter {
  // Read at call time, so a change of unit shows at once. Outside inches a size is always a decimal.
  const f = (n: number) => (style === 'decimal' && currentUnit === 'in' ? String(Math.round(n * 100) / 100) : fmt(n))
  return {
    fmt: f,
    fmtDims: (w, h) => `${f(w)} × ${f(h)}`,
    fmtLeft: (w, h) => `${f(Math.min(w, h))} × ${f(Math.max(w, h))}`,
  }
}

/**
 * Fractions only when the user typed one of this job's sizes as a fraction (22 1/2); decimals
 * otherwise, including older jobs that recorded nothing: the worked-out sizes follow the way
 * the job itself was written, so one page never mixes the two.
 */
export function sizeStyleOf(pieces?: Array<{ wText?: string; hText?: string }>): SizeStyle {
  const texts = (pieces ?? []).flatMap((p) => [p.wText, p.hText]).filter((t): t is string => !!t)
  return texts.some((t) => t.includes('/')) ? 'fraction' : 'decimal'
}
