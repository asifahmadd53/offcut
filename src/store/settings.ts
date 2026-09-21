import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { saveSettings } from '@/lib/db'
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
  if (prev.sheetW !== next.sheetW || prev.sheetH !== next.sheetH) {
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
        dropPlanIfSheetSizeChanged(prev, next)
        const uid = useAuth.getState().uid
        if (uid) saveSettings(uid, next)
      },
      applyRemote: (remote) => {
        const prev = get().settings
        const next = { ...DEFAULT_SETTINGS, ...prev, ...remote }
        set({ settings: next })
        dropPlanIfSheetSizeChanged(prev, next)
      },
    }),
    { name: 'sc-settings' },
  ),
)
