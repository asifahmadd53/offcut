import { afterEach, describe, expect, it } from 'vitest'
import { areaLabel, fmt, fmtArea, fmtIn, parseInches, parseSize, pieceDims, setDisplayUnit, sizeFormatter, unitLabel } from './inches'
import { packJob } from './packer'
import { buildBlocks } from './sheetView'
import { deriveStock } from './stock'
import { DEFAULT_SETTINGS, UNASSIGNED_CLIENT_ID, UNASSIGNED_CLIENT_NAME, type CutDoc, type Piece } from './types'
import { draftFrom, validate } from '@/pages/Settings'

afterEach(() => setDisplayUnit('in'))

describe('units: inches stay exactly as they were', () => {
  it('parses and writes the way it always did', () => {
    for (const t of ['22', '22.5', '22 1/2', '22-1/2"', '3/8', '22 in', 'x', '0', '']) {
      expect(parseSize(t, 'in')).toBe(parseInches(t))
    }
    expect(fmt(22.5)).toBe('22 1/2')
    expect(fmt(38.6)).toBe('38.6')
    expect(unitLabel()).toBe('in')
    expect(areaLabel()).toBe('sq in')
    expect(fmtArea(4608)).toBe('4,608')
  })
})

describe('units: typing a size in cm, mm, ft or in', () => {
  it('a plain number is in the chosen unit', () => {
    expect(parseSize('2.54', 'cm')).toBe(1)
    expect(parseSize('25.4', 'mm')).toBe(1)
    expect(parseSize('1220', 'mm')).toBeCloseTo(48.0315, 3)
    expect(parseSize('4', 'ft')).toBe(48)
    expect(parseSize('7.5', 'ft')).toBe(90)
  })
  it('a unit written after the number wins, whatever the setting', () => {
    expect(parseSize('50 cm', 'in')).toBeCloseTo(19.685, 3)
    expect(parseSize('1220mm', 'ft')).toBeCloseTo(48.0315, 3)
    expect(parseSize('4 ft', 'mm')).toBe(48)
    expect(parseSize('22 in', 'cm')).toBe(22)
    expect(parseSize("4'", 'cm')).toBe(48)
  })
  it('feet and inches together', () => {
    expect(parseSize('4 ft 6 in', 'cm')).toBe(54)
    expect(parseSize('4\' 6"', 'in')).toBe(54)
    expect(parseSize('4ft 6', 'mm')).toBe(54)
  })
  it('rubbish and zero are rejected in every unit', () => {
    for (const u of ['in', 'ft', 'cm', 'mm'] as const) {
      for (const t of ['', 'abc', '0', '12 cm cm', 'cm']) expect(parseSize(t, u), `${t} ${u}`).toBeNull()
    }
  })
})

describe('units: showing a size', () => {
  it('writes the same real size in each unit', () => {
    expect(fmtIn(48, 'in')).toBe('48')
    expect(fmtIn(48, 'ft')).toBe('4')
    expect(fmtIn(48, 'cm')).toBe('121.92')
    expect(fmtIn(96, 'mm')).toBe('2438.4')
    expect(fmtIn(0.125, 'mm')).toBe('3.18')
  })
  it('the app-wide unit changes fmt, the formatters, the labels and areas at once', () => {
    setDisplayUnit('cm')
    expect(fmt(48)).toBe('121.92')
    expect(sizeFormatter('fraction').fmt(10.5)).toBe('26.67')
    expect(sizeFormatter('decimal').fmtDims(10, 20)).toBe('25.4 × 50.8')
    expect(sizeFormatter('decimal').fmtLeft(20, 10)).toBe('25.4 × 50.8')
    expect(unitLabel()).toBe('cm')
    expect(areaLabel()).toBe('sq cm')
    expect(fmtArea(100)).toBe('645')
    setDisplayUnit('in')
    expect(fmt(48)).toBe('48')
  })
  it('a typed size is shown as typed only in the unit it was typed in', () => {
    const p = { w: 19.685039, h: 39.370079, wText: '50', hText: '100', unit: 'cm' as const }
    setDisplayUnit('cm')
    expect(pieceDims(p)).toBe('50 × 100')
    setDisplayUnit('in')
    expect(pieceDims(p)).toBe('19.69 × 39.37')
    setDisplayUnit('mm')
    expect(pieceDims(p)).toBe('500 × 1000')
    // an older piece (no unit) was typed in inches, so in mm its real size is shown
    expect(pieceDims({ w: 10.5, h: 38.6, wText: '10.5', hText: '38.6' })).toBe('266.7 × 980.44')
  })
})

describe('units: the plan is the same in every unit', () => {
  const inch: Piece[] = [{ id: 'a', w: 23, h: 77, qty: 2 }]
  it('a job typed in cm cuts exactly like the same job in inches', () => {
    const base = { sheetW: 48, sheetH: 96, kerf: 0.125, minLeftover: 1 }
    const a = packJob(inch, [], base)
    const cm = [{ id: 'a', w: parseSize('58.42', 'cm')!, h: parseSize('195.58', 'cm')!, qty: 2 }]
    const b = packJob(cm, [], base)
    const shape = (r: typeof a) => r.sheets.map((s) => s.placements.map((p) => `${p.x},${p.y},${p.w}x${p.h}`).join('|') + '/' + s.newLeftovers.map((l) => `${l.w}x${l.h}`).join('|'))
    expect(shape(b)).toEqual(shape(a))
  })
  it('a saved job read in another unit shows real sizes, not the old unit text', () => {
    const base = { sheetW: 48, sheetH: 96, kerf: 0, minLeftover: 1 }
    setDisplayUnit('cm')
    const pieces: Piece[] = [{ id: 'a', w: 20, h: 40, qty: 1, wText: '50.8', hText: '101.6', unit: 'cm' }]
    const r = packJob(pieces, [], base)
    expect(r.sheets[0].placements[0].label).toBe('50.8 × 101.6')
    expect(r.sheets[0].placements[0].labelUnit).toBe('cm')
    const cut: CutDoc = { id: 'c', type: 'cut', createdAt: 1, syncedAt: 1, deviceId: 'd', pieces, kerf: 0, sheets: r.sheets, clientId: UNASSIGNED_CLIENT_ID, clientName: UNASSIGNED_CLIENT_NAME }
    const d = deriveStock([cut])
    expect(buildBlocks(r.sheets[0], d, 'c').find((b) => b.kind === 'cut')!.label).toBe('50.8 × 101.6')
    setDisplayUnit('in')
    expect(buildBlocks(r.sheets[0], d, 'c').find((b) => b.kind === 'cut')!.label).toBeUndefined()
  })
  it('inch jobs carry no unit marks at all (older records are unchanged)', () => {
    const r = packJob(inch, [], { sheetW: 48, sheetH: 96, kerf: 0, minLeftover: 1 })
    expect('labelUnit' in r.sheets[0].placements[0]).toBe(false)
  })
})

describe('units: no mistakes in the conversion layer', () => {
  it('inches written for a draft never follow the unit the app is showing', () => {
    setDisplayUnit('cm')
    expect(fmtIn(48, 'in')).toBe('48')
    expect(fmtIn(0.125, 'in')).toBe('1/8')
    expect(fmtIn(22.5, 'in')).toBe('22 1/2')
    setDisplayUnit('mm')
    expect(fmtIn(0.125, 'in')).toBe('1/8')
    expect(fmtIn(48, 'cm')).toBe('121.92')
  })
  it('a small area in square feet is not shown as 0', () => {
    expect(fmtArea(20, 'ft')).toBe('0.14')
    expect(fmtArea(4608, 'ft')).toBe('32')
    expect(fmtArea(4608, 'cm')).toBe('29,729')
  })
  it('reading back what was written gives the same size, in every unit, for 2,000 sizes', () => {
    let s = 7
    const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296
    // the most a size can move is half of the last written place
    const tol: Record<string, number> = { in: 0.04, ft: 0.00005 * 12, cm: 0.005 / 2.54, mm: 0.005 / 25.4 }
    for (let i = 0; i < 2000; i++) {
      const inches = Math.round((0.5 + rnd() * 120) * 16) / 16
      for (const u of ['in', 'ft', 'cm', 'mm'] as const) {
        const text = fmtIn(inches, u)
        const back = parseSize(text, u)!
        expect(Math.abs(back - inches), `${inches} in as ${text} ${u}`).toBeLessThanOrEqual(tol[u] + 1e-4)
      }
    }
  })
  it('the same real size is the same number of inches however it is written', () => {
    expect(parseSize('4 ft', 'in')).toBe(parseSize('48', 'in'))
    expect(parseSize('121.92 cm', 'in')).toBe(48)
    expect(parseSize('1219.2 mm', 'in')).toBe(48)
    expect(parseSize('2438.4', 'mm')).toBe(96)
    expect(parseSize('8 ft', 'cm')).toBe(96)
    expect(parseSize('3.175', 'mm')).toBeCloseTo(0.125, 4)
  })
})

describe('units: Settings fields', () => {
  it('shows the saved sizes in the chosen unit and keeps them exact when untouched', () => {
    const s = { ...DEFAULT_SETTINGS, unit: 'mm' as const, kerfOn: true, kerfSize: 0.125 }
    const d = draftFrom(s)
    expect(d).toMatchObject({ unit: 'mm', sheetW: '1219.2', sheetH: '2438.4', kerfSize: '3.18' })
    const v = validate(d, s)
    expect(v.values).toMatchObject({ sheetW: 48, sheetH: 96, kerfSize: 0.125, unit: 'mm' })
  })
  it('a field that was typed is read in the chosen unit', () => {
    const s = { ...DEFAULT_SETTINGS, unit: 'cm' as const }
    const d = { ...draftFrom(s), sheetW: '122', sheetH: '244' }
    const v = validate(d, s)
    expect(v.values!.sheetW).toBeCloseTo(48.0315, 3)
    expect(v.values!.sheetH).toBeCloseTo(96.063, 3)
  })
  it('the blade default is 1/8 inch in any unit', () => {
    expect(draftFrom({ ...DEFAULT_SETTINGS, kerfSize: 0 }).kerfSize).toBe('1/8')
    expect(draftFrom({ ...DEFAULT_SETTINGS, kerfSize: 0, unit: 'cm' }).kerfSize).toBe('0.32')
  })
  it('settings saved before units existed are in inches', () => {
    const old = { ...DEFAULT_SETTINGS } as Partial<typeof DEFAULT_SETTINGS>
    delete old.unit
    expect(draftFrom(old as typeof DEFAULT_SETTINGS).unit).toBe('in')
  })
})
