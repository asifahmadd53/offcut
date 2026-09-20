import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { uid } from '@/lib/id'
import { packJob, type Item } from '@/lib/packer'
import type { Piece, SheetPlan } from '@/lib/types'
import { useData } from './data'
import { useSettings } from './settings'

export interface PlanState {
  sheets: SheetPlan[]
  unplaced: Item[]
  /** Leftovers the user asked not to use ("Pick a different leftover"). */
  excluded: string[]
  kerf: number
}

interface JobState {
  /** The pieces being entered. Saved on the phone so nothing is lost if the app closes. */
  pieces: Piece[]
  plan: PlanState | null
  /** Set from Leftover detail's "Use this in a new job": restrict the next plan to this one leftover. */
  onlyLeftoverId: string | null
  addPiece: (w: number, h: number, qty: number) => void
  removePiece: (id: string) => void
  setPieces: (pieces: Piece[]) => void
  clearJob: () => void
  buildPlan: (excluded?: string[]) => void
  dropPlan: () => void
  setOnlyLeftoverId: (id: string | null) => void
}

export const useJob = create<JobState>()(
  persist(
    (set, get) => ({
      pieces: [],
      plan: null,
      onlyLeftoverId: null,
      addPiece: (w, h, qty) =>
        set((s) => ({ pieces: [...s.pieces, { id: uid(), w, h, qty }], plan: null })),
      removePiece: (id) =>
        set((s) => ({ pieces: s.pieces.filter((p) => p.id !== id), plan: null })),
      setPieces: (pieces) => set({ pieces, plan: null }),
      clearJob: () => set({ pieces: [], plan: null, onlyLeftoverId: null }),
      buildPlan: (excluded = []) => {
        const { derived } = useData.getState()
        const { settings } = useSettings.getState()
        const kerf = settings.kerfOn ? settings.kerfSize : 0
        const only = get().onlyLeftoverId
        const stock = only
          ? derived.freeLeftovers.filter((l) => l.id === only)
          : derived.freeLeftovers
        const result = packJob(
          get().pieces,
          stock,
          {
            sheetW: settings.sheetW,
            sheetH: settings.sheetH,
            kerf,
            minLeftover: settings.minLeftover,
          },
          new Set(excluded),
          derived.sheetLetters,
        )
        set({ plan: { sheets: result.sheets, unplaced: result.unplaced, excluded, kerf } })
      },
      dropPlan: () => set({ plan: null }),
      setOnlyLeftoverId: (id) => set({ onlyLeftoverId: id }),
    }),
    { name: 'sc-job-draft', partialize: (s) => ({ pieces: s.pieces }) },
  ),
)
