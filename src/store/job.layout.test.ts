import { beforeEach, describe, expect, it } from 'vitest'
import { effectiveLayout, isPlainLayout, layoutOfSettings, layoutSummary, packOptionsFor, sameLayout } from '@/lib/layout'
import { DEFAULT_SETTINGS, type Piece } from '@/lib/types'
import { useData } from './data'
import { useJob } from './job'
import { useSettings } from './settings'

const wide: Piece[] = [{ id: 'a', w: 60, h: 20, qty: 1 }]

describe('the sheet layout a job is cut with', () => {
  beforeEach(() => {
    useData.setState({ derived: { ...useData.getState().derived, freeLeftovers: [], leftovers: [], jobs: [], conflicts: [], activeCuts: [], sheetLetters: new Map() } })
    useSettings.setState({ settings: { ...DEFAULT_SETTINGS } })
    useJob.setState({ pieces: wide, clientId: 'c1', clientName: 'Asif', plan: null, onlyLeftoverId: null, forceNewSheet: false, layoutOverride: null })
  })

  it('the defaults are the plain layout: any cut, no grain', () => {
    expect(layoutOfSettings(DEFAULT_SETTINGS)).toEqual({ method: 'normal', levels: 2, grain: false })
    expect(isPlainLayout(layoutOfSettings(DEFAULT_SETTINGS))).toBe(true)
  })

  it('settings saved before layouts existed still give the plain layout', () => {
    const old = { ...DEFAULT_SETTINGS } as Partial<typeof DEFAULT_SETTINGS>
    delete old.layoutMethod
    delete old.layoutLevels
    delete old.grain
    expect(effectiveLayout(old as typeof DEFAULT_SETTINGS, null)).toEqual({ method: 'normal', levels: 2, grain: false })
  })

  it('a job with no layout of its own uses the Settings defaults, and a plain job turns a piece that needs it', () => {
    useJob.getState().buildPlan()
    const plan = useJob.getState().plan!
    expect(plan.layout).toEqual({ method: 'normal', levels: 2, grain: false })
    expect(plan.unplaced).toHaveLength(0)
    expect(plan.sheets[0].placements[0].rotated).toBe(true)
    expect(plan.sheets[0].grain).toBeUndefined()
  })

  it('Settings can make grain the default for every new job', () => {
    useSettings.setState({ settings: { ...DEFAULT_SETTINGS, grain: true } })
    useJob.getState().buildPlan()
    const plan = useJob.getState().plan!
    expect(plan.layout.grain).toBe(true)
    expect(plan.unplaced).toHaveLength(1) // the 60-wide piece cannot fit without turning
    expect(plan.sheets.every((s) => s.placements.every((p) => !p.rotated))).toBe(true)
  })

  it('a job can choose its own layout, which wins over the Settings defaults', () => {
    useJob.getState().setLayoutOverride({ method: 'length', levels: 3, grain: true })
    expect(effectiveLayout(useSettings.getState().settings, useJob.getState().layoutOverride)).toEqual({ method: 'length', levels: 3, grain: true })
    useJob.getState().buildPlan()
    expect(useJob.getState().plan!.layout).toEqual({ method: 'length', levels: 3, grain: true })
  })

  it('changing the layout drops a plan that was made another way, and clearing the job forgets the choice', () => {
    useJob.getState().buildPlan()
    expect(useJob.getState().plan).not.toBeNull()
    useJob.getState().setLayoutOverride({ method: 'width', levels: 2, grain: false })
    expect(useJob.getState().plan).toBeNull()
    useJob.getState().clearJob()
    expect(useJob.getState().layoutOverride).toBeNull()
  })

  it('the planner is told the sheet, blade, minimum leftover, grain and cut method', () => {
    const opts = packOptionsFor({ ...DEFAULT_SETTINGS, kerfOn: true, kerfSize: 0.125 }, { method: 'width', levels: 3, grain: true })
    expect(opts).toEqual({ sheetW: 48, sheetH: 96, kerf: 0.125, minLeftover: 1, grain: true, layout: 'width', levels: 3 })
  })

  it('layouts compare and read back in plain words', () => {
    expect(sameLayout({ method: 'normal', levels: 2, grain: false }, { method: 'normal', levels: 2, grain: false })).toBe(true)
    expect(sameLayout({ method: 'normal', levels: 2, grain: false }, { method: 'normal', levels: 2, grain: true })).toBe(false)
    expect(layoutSummary({ method: 'length', levels: 3, grain: true })).toBe('Grain top to bottom (pieces never turned) · First cut along the length, 3 rounds')
    expect(layoutSummary({ method: 'normal', levels: 2, grain: false })).toBe('No grain · Normal cutting')
  })
})
