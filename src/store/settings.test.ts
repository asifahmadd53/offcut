import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '@/lib/types'
import { useJob } from './job'
import { useSettings } from './settings'

/**
 * These exercise the real Zustand stores directly (no React/DOM needed) rather than the
 * Settings.tsx component, since this project has no component-testing setup — Firebase's
 * writes are gated behind an authenticated uid, which is null by default here, so update()
 * never actually reaches the network.
 */
describe('sheet size setting', () => {
  beforeEach(() => {
    useSettings.setState({ settings: DEFAULT_SETTINGS })
    useJob.setState({ pieces: [], plan: null, onlyLeftoverId: null, forceNewSheet: false })
  })

  it('defaults to 48 wide and 96 tall', () => {
    expect(useSettings.getState().settings.sheetW).toBe(48)
    expect(useSettings.getState().settings.sheetH).toBe(96)
  })

  it('after changing to 60 x 120, the next plan uses 60 x 120', () => {
    useSettings.getState().update({ sheetW: 60, sheetH: 120 })
    useJob.getState().setPieces([{ id: 'p1', w: 30, h: 40, qty: 1 }])
    useJob.getState().buildPlan()
    const sheet = useJob.getState().plan?.sheets[0]
    expect(sheet?.sheetW).toBe(60)
    expect(sheet?.sheetH).toBe(120)
  })

  it('changing the sheet size drops any existing unconfirmed plan', () => {
    useJob.getState().setPieces([{ id: 'p1', w: 20, h: 20, qty: 1 }])
    useJob.getState().buildPlan()
    expect(useJob.getState().plan).not.toBeNull()

    useSettings.getState().update({ sheetW: 60, sheetH: 120 })
    expect(useJob.getState().plan).toBeNull()
  })

  it('changing a setting other than the sheet size does not drop the plan', () => {
    useJob.getState().setPieces([{ id: 'p1', w: 20, h: 20, qty: 1 }])
    useJob.getState().buildPlan()
    expect(useJob.getState().plan).not.toBeNull()

    useSettings.getState().update({ minLeftover: 2 })
    expect(useJob.getState().plan).not.toBeNull()
  })

  it('a sheet size change arriving from another device (applyRemote) also drops the plan', () => {
    useJob.getState().setPieces([{ id: 'p1', w: 20, h: 20, qty: 1 }])
    useJob.getState().buildPlan()
    expect(useJob.getState().plan).not.toBeNull()

    useSettings.getState().applyRemote({ sheetW: 60, sheetH: 120 })
    expect(useJob.getState().plan).toBeNull()
  })
})
