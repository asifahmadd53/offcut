import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { uid } from '@/lib/id'
import { packJob, type Item } from '@/lib/packer'
import type { Leftover, Piece, SheetPlan } from '@/lib/types'
import { useData } from './data'
import { useSettings } from './settings'

export interface PlanState {
  sheets: SheetPlan[]
  unplaced: Item[]
  /** Leftovers the user asked not to use ("Pick a different leftover"). */
  excluded: string[]
  kerf: number
}

/** Result of trying the restricted-leftover pack, before any plan is committed to state. */
export interface LeftoverFitCheck {
  fits: boolean
  leftover: Leftover
  /** Pieces (with quantity) that do not fit this leftover, even turned. */
  misfits: Array<{ w: number; h: number; qty: number }>
  /** True when at least one piece did fit. */
  someFit: boolean
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
  /**
   * Checks whether every typed piece fits `onlyLeftoverId` alone, with no new sheet.
   * Returns null when onlyLeftoverId is not set or the leftover is no longer free.
   */
  checkLeftoverFit: () => LeftoverFitCheck | null
  /** Builds the plan using only onlyLeftoverId plus new sheets for whatever does not fit it. */
  buildPlanWithNewSheet: () => void
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
            // Leftover-restricted planning must never silently open a new sheet:
            // the caller checks the fit first (checkLeftoverFit) and only reaches
            // here once every piece is known to fit the one leftover alone.
            minLeftover: settings.minLeftover,
            allowNewSheets: !only,
          },
          new Set(excluded),
          derived.sheetLetters,
        )
        set({ plan: { sheets: result.sheets, unplaced: result.unplaced, excluded, kerf } })
      },
      checkLeftoverFit: () => {
        const only = get().onlyLeftoverId
        if (!only) return null
        const { derived } = useData.getState()
        const { settings } = useSettings.getState()
        const lo = derived.freeLeftovers.find((l) => l.id === only)
        if (!lo) return null
        const kerf = settings.kerfOn ? settings.kerfSize : 0
        const result = packJob(
          get().pieces,
          [lo],
          {
            sheetW: settings.sheetW,
            sheetH: settings.sheetH,
            kerf,
            minLeftover: settings.minLeftover,
            allowNewSheets: false,
          },
          new Set(),
          derived.sheetLetters,
        )
        const byPiece = new Map(get().pieces.map((p) => [p.id, p]))
        const misfitCounts = new Map<string, number>()
        for (const item of result.unplaced) {
          misfitCounts.set(item.pieceId, (misfitCounts.get(item.pieceId) ?? 0) + 1)
        }
        const misfits = [...misfitCounts.entries()].map(([pieceId, qty]) => {
          const p = byPiece.get(pieceId)
          return { w: p?.w ?? 0, h: p?.h ?? 0, qty }
        })
        return {
          fits: result.unplaced.length === 0,
          leftover: lo,
          misfits,
          someFit: result.sheets.some((s) => s.placements.length > 0),
        }
      },
      buildPlanWithNewSheet: () => {
        const { derived } = useData.getState()
        const { settings } = useSettings.getState()
        const kerf = settings.kerfOn ? settings.kerfSize : 0
        const only = get().onlyLeftoverId
        const stock = only ? derived.freeLeftovers.filter((l) => l.id === only) : []
        const result = packJob(
          get().pieces,
          stock,
          {
            sheetW: settings.sheetW,
            sheetH: settings.sheetH,
            kerf,
            minLeftover: settings.minLeftover,
            allowNewSheets: true,
          },
          new Set(),
          derived.sheetLetters,
        )
        set({ plan: { sheets: result.sheets, unplaced: result.unplaced, excluded: [], kerf } })
      },
      dropPlan: () => set({ plan: null }),
      setOnlyLeftoverId: (id) => set({ onlyLeftoverId: id }),
    }),
    { name: 'sc-job-draft', partialize: (s) => ({ pieces: s.pieces }) },
  ),
)
