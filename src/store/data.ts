import { create } from 'zustand'
import { onSnapshot, type Timestamp } from 'firebase/firestore'
import { cutsCollection, resolutionsCollection, settingsDoc } from '@/lib/db'
import { deriveStock, EMPTY_DERIVED, type Derived } from '@/lib/stock'
import type { CutDoc, Resolution, Settings } from '@/lib/types'
import { useSettings } from './settings'

const LAST_SYNC_KEY = 'sc-last-sync'

function readLastSync(): number | null {
  try {
    const v = localStorage.getItem(LAST_SYNC_KEY)
    return v ? Number(v) : null
  } catch {
    return null
  }
}

interface DataState {
  cuts: CutDoc[]
  resolutions: Record<string, Resolution>
  derived: Derived
  ready: boolean
  online: boolean
  /** Some records on this phone have not reached the server yet. */
  pending: boolean
  /** Count of cut and resolution documents not yet confirmed by the server. */
  pendingCount: number
  /** The data shown comes from the phone, not confirmed by the server. */
  fromCache: boolean
  lastSyncedAt: number | null
  start: (uid: string) => void
  stop: () => void
}

let unsubs: Array<() => void> = []
const meta = {
  cuts: { pending: false, fromCache: true, count: 0 },
  resolutions: { pending: false, fromCache: true, count: 0 },
  settings: { pending: false, fromCache: true },
}

export const useData = create<DataState>((set, get) => {
  const refreshSync = () => {
    const pending = meta.cuts.pending || meta.resolutions.pending || meta.settings.pending
    const pendingCount = meta.cuts.count + meta.resolutions.count
    const fromCache = meta.cuts.fromCache
    const online = typeof navigator === 'undefined' ? true : navigator.onLine
    const synced = online && !fromCache && !pending
    let lastSyncedAt = get().lastSyncedAt
    if (synced) {
      lastSyncedAt = Date.now()
      try {
        localStorage.setItem(LAST_SYNC_KEY, String(lastSyncedAt))
      } catch {
        /* storage blocked, ignore */
      }
    }
    set({ pending, pendingCount, fromCache, online, lastSyncedAt })
  }

  const onOnlineChange = () => refreshSync()

  return {
    cuts: [],
    resolutions: {},
    derived: EMPTY_DERIVED,
    ready: false,
    online: typeof navigator === 'undefined' ? true : navigator.onLine,
    pending: false,
    pendingCount: 0,
    fromCache: true,
    lastSyncedAt: readLastSync(),

    start: (uid) => {
      get().stop()

      const unsubCuts = onSnapshot(
        cutsCollection(uid),
        { includeMetadataChanges: true },
        (snap) => {
          const cuts = snap.docs.map((d) => {
            const v = d.data() as Omit<CutDoc, 'id' | 'syncedAt'> & { syncedAt?: Timestamp | null }
            return {
              ...v,
              id: d.id,
              syncedAt: v.syncedAt && typeof v.syncedAt.toMillis === 'function'
                ? v.syncedAt.toMillis()
                : null,
            } as CutDoc
          })
          meta.cuts = {
            pending: snap.metadata.hasPendingWrites,
            fromCache: snap.metadata.fromCache,
            count: snap.docs.filter((d) => d.metadata.hasPendingWrites).length,
          }
          set({
            cuts,
            derived: deriveStock(cuts, get().resolutions),
            ready: true,
          })
          refreshSync()
        },
        (err) => console.error('Cuts listener', err),
      )

      const unsubRes = onSnapshot(
        resolutionsCollection(uid),
        { includeMetadataChanges: true },
        (snap) => {
          const resolutions: Record<string, Resolution> = {}
          snap.docs.forEach((d) => {
            const choice = d.data().choice as Resolution
            if (choice === 'voided' || choice === 'kept') resolutions[d.id] = choice
          })
          meta.resolutions = {
            pending: snap.metadata.hasPendingWrites,
            fromCache: snap.metadata.fromCache,
            count: snap.docs.filter((d) => d.metadata.hasPendingWrites).length,
          }
          set({ resolutions, derived: deriveStock(get().cuts, resolutions) })
          refreshSync()
        },
        (err) => console.error('Answers listener', err),
      )

      const unsubSettings = onSnapshot(
        settingsDoc(uid),
        { includeMetadataChanges: true },
        (snap) => {
          meta.settings = {
            pending: snap.metadata.hasPendingWrites,
            fromCache: snap.metadata.fromCache,
          }
          if (snap.exists() && !snap.metadata.hasPendingWrites) {
            useSettings.getState().applyRemote(snap.data() as Partial<Settings>)
          }
          refreshSync()
        },
        (err) => console.error('Settings listener', err),
      )

      window.addEventListener('online', onOnlineChange)
      window.addEventListener('offline', onOnlineChange)
      document.addEventListener('visibilitychange', onOnlineChange)

      unsubs = [
        unsubCuts,
        unsubRes,
        unsubSettings,
        () => window.removeEventListener('online', onOnlineChange),
        () => window.removeEventListener('offline', onOnlineChange),
        () => document.removeEventListener('visibilitychange', onOnlineChange),
      ]
    },

    stop: () => {
      unsubs.forEach((fn) => fn())
      unsubs = []
      meta.cuts = { pending: false, fromCache: true, count: 0 }
      meta.resolutions = { pending: false, fromCache: true, count: 0 }
      meta.settings = { pending: false, fromCache: true }
      set({ cuts: [], resolutions: {}, derived: EMPTY_DERIVED, ready: false, pendingCount: 0 })
    },
  }
})
