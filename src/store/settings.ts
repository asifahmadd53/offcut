import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { saveSettings } from '@/lib/db'
import { setDisplayUnit } from '@/lib/inches'
import { DEFAULT_SETTINGS, type Settings } from '@/lib/types'
import { useAuth } from './auth'
import { useJob } from './job'

interface SettingsState {
  settings: Settings
  /** Change a setting on this phone and send it to the other phones. */
  update: (patch: Partial<Settings>) => void
  /** Used when the cloud copy arrives. Does not write back. */
  applyRemote: (remote: Partial<Settings>) => void
}

/** An unconfirmed plan was built against the old sheet size; drop it so the next
 *  buildPlan() call (or navigating back to Plan) rebuilds against the new one, on
 *  this phone or on whichever phone the change arrives at via applyRemote. */
function dropPlanIfSheetSizeChanged(prev: Settings, next: Settings) {
  // A plan's wording (sizes and units) was written in the old unit, so a change of unit also drops it.
  if (prev.sheetW !== next.sheetW || prev.sheetH !== next.sheetH || prev.unit !== next.unit) {
    useJob.getState().dropPlan()
  }
  // A plan made with the blade off must not stay on screen after the blade is switched on (or its width
  // changes): two 24 in pieces fit a 48 in sheet only without a blade. Grain and cutting style change the
  // layout the same way.
  if (
    prev.kerfOn !== next.kerfOn ||
    (next.kerfOn && prev.kerfSize !== next.kerfSize) ||
    prev.grain !== next.grain ||
    prev.layoutMethod !== next.layoutMethod ||
    prev.layoutLevels !== next.layoutLevels
  ) {
    useJob.getState().dropPlan()
  }
}

export const useSettings = create<SettingsState>()(
  persist(
    (set, get) => ({
      settings: DEFAULT_SETTINGS,
      update: (patch) => {
        const prev = get().settings
        const next = { ...prev, ...patch }
        set({ settings: next })
        setDisplayUnit(next.unit)
        dropPlanIfSheetSizeChanged(prev, next)
        const uid = useAuth.getState().uid
        if (uid) saveSettings(uid, next)
      },
      applyRemote: (remote) => {
        const prev = get().settings
        const next = { ...DEFAULT_SETTINGS, ...prev, ...remote }
        set({ settings: next })
        setDisplayUnit(next.unit)
        dropPlanIfSheetSizeChanged(prev, next)
      },
    }),
    {
      name: 'sc-settings',
      // Settings saved on this phone before a setting existed lack it; fill in its default.
      merge: (persisted, current) => {
        const settings = { ...DEFAULT_SETTINGS, ...((persisted as Partial<SettingsState> | undefined)?.settings ?? {}) }
        setDisplayUnit(settings.unit)
        return { ...current, ...(persisted as Partial<SettingsState>), settings }
      },
    },
  ),
)
