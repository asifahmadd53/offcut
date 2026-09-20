import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { saveSettings } from '@/lib/db'
import { DEFAULT_SETTINGS, type Settings } from '@/lib/types'
import { useAuth } from './auth'

interface SettingsState {
  settings: Settings
  /** Change a setting on this phone and send it to the other phones. */
  update: (patch: Partial<Settings>) => void
  /** Used when the cloud copy arrives. Does not write back. */
  applyRemote: (remote: Partial<Settings>) => void
}

export const useSettings = create<SettingsState>()(
  persist(
    (set, get) => ({
      settings: DEFAULT_SETTINGS,
      update: (patch) => {
        const next = { ...get().settings, ...patch }
        set({ settings: next })
        const uid = useAuth.getState().uid
        if (uid) saveSettings(uid, next)
      },
      applyRemote: (remote) => {
        set({ settings: { ...DEFAULT_SETTINGS, ...get().settings, ...remote } })
      },
    }),
    { name: 'sc-settings' },
  ),
)
