import { describe, expect, it } from 'vitest'
import { jsPDF } from 'jspdf'
import { packJob } from './packer'
import { buildPrintPages } from './print'
import { buildPrintSvgPages } from './pdf'
import { deriveStock } from './stock'
import { DEFAULT_SETTINGS, type CutDoc, type Piece } from './types'

const base = { sheetW: 48, sheetH: 96, kerf: 0.125, minLeftover: 1 }
const pieces: Piece[] = [
  { id: 'a', w: 23.15, h: 76, qty: 2, wText: '23.15', hText: '76' },
  { id: 'b', w: 21.2, h: 6.6, qty: 3, wText: '21.2', hText: '6.6' },
]

function pagesFor(grain: boolean, layout: 'normal' | 'length') {
  const o = { ...base, grain, layout, levels: 3 as const }
  const sheets = packJob(pieces, [], o).sheets
  const cut: CutDoc = {
    id: 'x',
    type: 'cut',
    createdAt: 1,
    syncedAt: 1,
    deviceId: 'd',
    pieces,
    kerf: base.kerf,
    sheets,
    clientName: 'Asif',
    ...(grain || layout !== 'normal' ? { layout: { method: layout, levels: 3 as const, grain } } : {}),
  }
  const pages = buildPrintPages(cut, deriveStock([cut]), DEFAULT_SETTINGS)
  return buildPrintSvgPages(pages, 'A4', jsPDF, cut)
}

describe('the printed page says when the sheet has a grain or was cut in strips', () => {
  it('a grained, strip-cut job names both and draws grain lines', () => {
    const svg = pagesFor(true, 'length').join('\n')
    // (The grain line wraps in the narrow column, so it is checked in its two parts.)
    expect(svg.includes('Grain runs top to bottom, pieces are not')).toBe(true)
    expect(svg.includes('First cut along the length, 3 rounds')).toBe(true)
    expect(svg.includes('>Grain<')).toBe(true)
    // The grain lines: many thin vertical lines inside the pieces.
    const vertical = [...svg.matchAll(/<line x1="([\d.]+)" y1="[\d.]+" x2="([\d.]+)"/g)].filter((m) => m[1] === m[2])
    expect(vertical.length).toBeGreaterThan(40)
  })

  it('a plain job prints exactly as before: no grain words, no grain legend', () => {
    const svg = pagesFor(false, 'normal').join('\n')
    expect(svg.includes('Grain')).toBe(false)
    expect(svg.includes('First cut along')).toBe(false)
  })
})
