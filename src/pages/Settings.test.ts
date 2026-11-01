import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '@/lib/types'
import { draftFrom, validate } from './Settings'

/**
 * validate() previously silently dropped kerfOn from its returned `values` object, so
 * toggling "Include blade thickness" and tapping Save changes looked like it worked
 * (the toast fired, dirty went back to false) but the toggle's actual state was never
 * sent to useSettings.update() — it reverted the next time Settings loaded. Every field
 * in Draft must round-trip through validate() so this class of bug can't reappear.
 */
describe('Settings validate()', () => {
  it('a toggled-on kerfOn survives validate() into values', () => {
    const draft = draftFrom({ ...DEFAULT_SETTINGS, kerfOn: false })
    const { values } = validate({ ...draft, kerfOn: true, kerfSize: '1/8' })
    expect(values?.kerfOn).toBe(true)
  })

  it('a toggled-off kerfOn survives validate() into values', () => {
    const draft = draftFrom({ ...DEFAULT_SETTINGS, kerfOn: true, kerfSize: 0.125 })
    const { values } = validate({ ...draft, kerfOn: false })
    expect(values?.kerfOn).toBe(false)
  })

  it('every Draft field the user can change is present in a successful validate() result', () => {
    const draft = draftFrom({ ...DEFAULT_SETTINGS, kerfOn: true, kerfSize: 0.125 })
    const { values } = validate(draft)
    expect(values).toMatchObject({
      sheetW: DEFAULT_SETTINGS.sheetW,
      sheetH: DEFAULT_SETTINGS.sheetH,
      kerfOn: true,
      kerfSize: 0.125,
      minLeftover: DEFAULT_SETTINGS.minLeftover,
      paperSize: DEFAULT_SETTINGS.paperSize,
    })
  })
})

/**
 * A saved kerfSize of 0 (written whenever the toggle was off, per validate()'s own
 * kerfOn-gated zeroing) means "not set", not "blade width is zero" — the Blade width
 * field must never show 0 to the carpenter, since a 0 in dimension fields elsewhere in
 * this app means an invalid/rejected size, not a real value.
 */
describe('Settings draftFrom()', () => {
  it('a saved kerfSize of 0 (toggle was off) shows a sensible default, not 0', () => {
    const draft = draftFrom({ ...DEFAULT_SETTINGS, kerfOn: false, kerfSize: 0 })
    expect(draft.kerfSize).toBe('1/8')
  })

  it('a real saved kerfSize (toggle was on) shows that exact value', () => {
    const draft = draftFrom({ ...DEFAULT_SETTINGS, kerfOn: true, kerfSize: 0.25 })
    expect(draft.kerfSize).toBe('1/4')
  })
})

/** The sheet layout (grain, how the sheet is cut, rounds) saved in Settings is the default every new job starts with. */
describe('Settings sheet layout', () => {
  it('the layout choices survive validate() into values', () => {
    const draft = draftFrom(DEFAULT_SETTINGS)
    const { values } = validate({ ...draft, layoutMethod: 'width', layoutLevels: 3, grain: true })
    expect(values).toMatchObject({ layoutMethod: 'width', layoutLevels: 3, grain: true })
  })

  it('settings saved before layouts existed show the plain defaults', () => {
    const old = { ...DEFAULT_SETTINGS } as Partial<typeof DEFAULT_SETTINGS>
    delete old.layoutMethod
    delete old.layoutLevels
    delete old.grain
    const draft = draftFrom(old as typeof DEFAULT_SETTINGS)
    expect(draft).toMatchObject({ layoutMethod: 'normal', layoutLevels: 2, grain: false })
  })
})

describe('sheet size is written back the way it was typed (soot)', () => {
  const base = { ...DEFAULT_SETTINGS }

  it('47.6 x 95.6 is saved as 47.75 x 95.75 and shows as 47.6 x 95.6, not 47 3/4', () => {
    const draft = { ...draftFrom(base), sheetW: '47.6', sheetH: '95.6' }
    const res = validate(draft, base)
    expect(res.errors).toEqual({})
    expect(res.values?.sheetW).toBe(47.75)
    expect(res.values?.sheetH).toBe(95.75)
    const shown = draftFrom({ ...base, ...res.values } as typeof base)
    expect(shown.sheetW).toBe('47.6')
    expect(shown.sheetH).toBe('95.6')
    // and reading what is shown gives the same sizes again
    expect(validate(shown, { ...base, ...res.values } as typeof base).values?.sheetW).toBe(47.75)
  })

  it('whole sizes and other units are written as before', () => {
    expect(draftFrom(base).sheetW).toBe('48')
    expect(draftFrom(base).sheetH).toBe('96')
    expect(draftFrom({ ...base, unit: 'cm' } as typeof base).sheetW).toBe('121.92')
    expect(draftFrom({ ...base, sheetW: 47.0625 }).sheetW).toBe('47 1/16')
  })
})

describe('a carried soot is saved as the next inch', () => {
  it('47.8 x 95.8 is saved as 48 x 96 and shows 48 and 96', () => {
    const base = { ...DEFAULT_SETTINGS }
    const res = validate({ ...draftFrom(base), sheetW: '47.8', sheetH: '95.8' }, base)
    expect(res.values?.sheetW).toBe(48)
    expect(res.values?.sheetH).toBe(96)
    const shown = draftFrom({ ...base, ...res.values } as typeof base)
    expect(shown.sheetW).toBe('48')
    expect(shown.sheetH).toBe('96')
  })
})

