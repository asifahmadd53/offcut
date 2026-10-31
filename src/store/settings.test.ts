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

describe('blade setting and an unconfirmed plan', () => {
  beforeEach(() => {
    useSettings.setState({ settings: DEFAULT_SETTINGS })
    useJob.setState({ pieces: [], plan: null, onlyLeftoverId: null, forceNewSheet: false })
  })

  it('switching the blade on drops a plan made without it, and the new plan keeps the blade gap', () => {
    useJob.getState().setPieces([
      { id: 'a', w: 24, h: 50, qty: 1 },
      { id: 'b', w: 24, h: 50, qty: 1 },
    ])
    useJob.getState().buildPlan()
    expect(useJob.getState().plan?.sheets.length).toBe(1)

    useSettings.getState().update({ kerfOn: true, kerfSize: 0.125 })
    expect(useJob.getState().plan).toBeNull()

    useJob.getState().buildPlan()
    expect(useJob.getState().plan?.sheets.length).toBe(2)
  })

  it('changing the blade width while it is on drops the plan; while it is off it does not', () => {
    useSettings.getState().update({ kerfOn: true, kerfSize: 0.125 })
    useJob.getState().setPieces([{ id: 'a', w: 20, h: 20, qty: 1 }])
    useJob.getState().buildPlan()
    useSettings.getState().update({ kerfSize: 0.25 })
    expect(useJob.getState().plan).toBeNull()

    useSettings.getState().update({ kerfOn: false })
    useJob.getState().buildPlan()
    useSettings.getState().update({ kerfSize: 0.5 })
    expect(useJob.getState().plan).not.toBeNull()
  })
})

describe('blade switched on while no width was saved', () => {
  it('uses 1/8 in, so two 24 in pieces do not share a 48 in sheet (the New job switch only flips on/off)', () => {
    // Saved with the blade off, the width is stored as 0; New job's own switch then turns it on.
    useSettings.setState({ settings: { ...DEFAULT_SETTINGS, kerfOn: true, kerfSize: 0, grain: true } })
    useJob.setState({ pieces: [], plan: null, onlyLeftoverId: null, forceNewSheet: false })
    useJob.getState().setPieces([
      { id: 'a', w: 24, h: 44, qty: 1 },
      { id: 'b', w: 24, h: 55, qty: 1 },
    ])
    useJob.getState().buildPlan()
    const plan = useJob.getState().plan
    expect(plan?.kerf).toBe(0.125)
    expect(plan?.sheets.length).toBe(2)
  })
})

