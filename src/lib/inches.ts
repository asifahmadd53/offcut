const r4 = (n: number) => Math.round(n * 1e4) / 1e4

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

/** Shows a size the way a carpenter reads it: 22 1/2, 3/8, 19. */
export function fmt(n: number): string {
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
export const pieceDims = (p: { w: number; h: number; wText?: string; hText?: string }) => {
  const f = sizeFormatter('decimal').fmt
  return `${p.wText ?? f(p.w)} × ${p.hText ?? f(p.h)}`
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
  const f = style === 'decimal' ? (n: number) => String(Math.round(n * 100) / 100) : fmt
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
