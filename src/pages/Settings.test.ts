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
