import { create } from 'zustand'
import { onSnapshot, type Timestamp } from 'firebase/firestore'
import { cutsCollection, hiddenJobsCollection, resolutionsCollection, saveHiddenJob, settingsDoc } from '@/lib/db'
import { deriveStock, EMPTY_DERIVED, type Derived } from '@/lib/stock'
import type { CutDoc, Resolution, Settings } from '@/lib/types'
import { useSettings } from './settings'

const LAST_SYNC_KEY = 'sc-last-sync'
const HIDDEN_JOBS_KEY = 'sc-hidden-jobs'

function readLastSync(): number | null {
  try {
    const v = localStorage.getItem(LAST_SYNC_KEY)
    return v ? Number(v) : null
  } catch {
    return null
  }
}

/**
 * A job hide is remembered on this phone the instant it happens, independent of whether
 * the Firestore write has synced yet. This is a backup, not the source of truth: every
 * hide is still written to Firestore (so other phones learn about it too), but a phone
 * never "forgets" a hide it already knows about just because a server snapshot it reads
 * later happens to not include that id yet (a slow/offline write, a stale cached read).
 */
function readLocalHiddenJobs(): Set<string> {
  try {
    const v = localStorage.getItem(HIDDEN_JOBS_KEY)
    return v ? new Set(JSON.parse(v) as string[]) : new Set()
  } catch {
    return new Set()
  }
}

function addLocalHiddenJobs(ids: Iterable<string>) {
  try {
    const current = readLocalHiddenJobs()
    for (const id of ids) current.add(id)
    localStorage.setItem(HIDDEN_JOBS_KEY, JSON.stringify([...current]))
  } catch {
    /* storage blocked, ignore — Firestore sync is still the source of truth */
  }
}

interface DataState {
  cuts: CutDoc[]
  resolutions: Record<string, Resolution>
  hiddenJobIds: Set<string>
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
  /**
   * Hides a job (or several) from the job lists. Records the hide on this phone
   * immediately (so it can never be lost/delayed by the network) and fires the
   * Firestore write so other phones learn about it too — never awaited, per R10.
   */
  hideJobs: (uid: string, cutIds: string[]) => void
}

let unsubs: Array<() => void> = []
const meta = {
  cuts: { pending: false, fromCache: true, count: 0 },
  resolutions: { pending: false, fromCache: true, count: 0 },
  hiddenJobs: { pending: false, fromCache: true, count: 0 },
  settings: { pending: false, fromCache: true },
}

export const useData = create<DataState>((set, get) => {
  const refreshSync = () => {
    const pending =
      meta.cuts.pending || meta.resolutions.pending || meta.hiddenJobs.pending || meta.settings.pending
    const pendingCount = meta.cuts.count + meta.resolutions.count + meta.hiddenJobs.count
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
    hiddenJobIds: readLocalHiddenJobs(),
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
            derived: deriveStock(cuts, get().resolutions, get().hiddenJobIds),
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
          set({ resolutions, derived: deriveStock(get().cuts, resolutions, get().hiddenJobIds) })
          refreshSync()
        },
        (err) => console.error('Answers listener', err),
      )

      const unsubHidden = onSnapshot(
        hiddenJobsCollection(uid),
        { includeMetadataChanges: true },
        (snap) => {
          // Merge with this phone's own locally-remembered hides (readLocalHiddenJobs) so a
          // hide never "un-happens" just because this particular snapshot doesn't include it
          // yet — e.g. a slow/offline write, or a stale cached read arriving after a fresher
          // local write. Firestore stays the source of truth for syncing to OTHER phones;
          // this only protects the phone that actually did the hiding.
          const hiddenJobIds = new Set([...snap.docs.map((d) => d.id), ...readLocalHiddenJobs()])
          meta.hiddenJobs = {
            pending: snap.metadata.hasPendingWrites,
            fromCache: snap.metadata.fromCache,
            count: snap.docs.filter((d) => d.metadata.hasPendingWrites).length,
          }
          set({ hiddenJobIds, derived: deriveStock(get().cuts, get().resolutions, hiddenJobIds) })
          refreshSync()
        },
        (err) => console.error('Hidden jobs listener', err),
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
        unsubHidden,
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
      meta.hiddenJobs = { pending: false, fromCache: true, count: 0 }
      meta.settings = { pending: false, fromCache: true }
      set({
        cuts: [],
        resolutions: {},
        // Re-seed from localStorage rather than wiping to an empty Set: stop() runs on
        // every start() call (it's the first line of start()), not just on logout, so
        // resetting this to empty left a real window — between stop() and the next
        // hiddenJobs snapshot arriving — where a hidden job would show as visible again.
        hiddenJobIds: readLocalHiddenJobs(),
        derived: EMPTY_DERIVED,
        ready: false,
        pendingCount: 0,
      })
    },

    hideJobs: (uid, cutIds) => {
      if (cutIds.length === 0) return
      addLocalHiddenJobs(cutIds)
      const hiddenJobIds = new Set([...get().hiddenJobIds, ...cutIds])
      set({ hiddenJobIds, derived: deriveStock(get().cuts, get().resolutions, hiddenJobIds) })
      for (const id of cutIds) saveHiddenJob(uid, id) // fire and forget, per R10
    },
  }
})
