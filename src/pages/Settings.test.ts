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
