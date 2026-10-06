import { describe, expect, it } from 'vitest'
import { cleanTyped, pieceDims, sizeFormatter, sizeStyleOf } from './inches'
import { packJob } from './packer'
import { pieceSummary } from './summary'

describe('sizes shown exactly as typed', () => {
  it('keeps what was typed, minus units and extra spaces, with no conversion', () => {
    expect(cleanTyped('10.5')).toBe('10.5')
    expect(cleanTyped(' 38.6 in ')).toBe('38.6')
    expect(cleanTyped('22  1/2"')).toBe('22 1/2')
    expect(cleanTyped('22-1/2')).toBe('22-1/2')
  })

  it('a piece shows its typed text; older pieces without it fall back to the usual fractions', () => {
    expect(pieceDims({ w: 10.5, h: 38.6, wText: '10.5', hText: '38.6' })).toBe('10.5 × 38.6')
    expect(pieceDims({ w: 10.5, h: 38.6 })).toBe('10 1/2 × 38.6')
  })

  it('the plan, its labels and the job summary all carry the typed text', () => {
    const pieces = [{ id: 'a', w: 10.5, h: 38.6, qty: 2, wText: '10.5', hText: '38.6' }]
    const r = packJob(pieces, [], { sheetW: 48, sheetH: 96, kerf: 0, minLeftover: 1 })
    expect(r.sheets[0].placements.map((p) => p.label)).toEqual(['10.5 × 38.6', '10.5 × 38.6'])
    expect(pieceSummary(pieces)).toBe('10.5 × 38.6, 2 pcs')
  })

  it('worked-out sizes follow the style the job was typed in', () => {
    expect(sizeStyleOf([{ wText: '10.5', hText: '38.6' }])).toBe('decimal')
    expect(sizeStyleOf([{ wText: '22 1/2', hText: '30' }])).toBe('fraction')
    expect(sizeStyleOf([{}])).toBe('fraction')
    expect(sizeStyleOf(undefined)).toBe('fraction')
    const dec = sizeFormatter('decimal')
    expect(dec.fmt(15.9375)).toBe('15.94')
    expect(dec.fmtLeft(48, 3.75)).toBe('3.75 × 48')
    expect(sizeFormatter('fraction').fmtLeft(48, 15.9375)).toBe('15 15/16 × 48')
  })
})
