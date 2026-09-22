import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { uid } from '@/lib/id'
import { packJob, type Item } from '@/lib/packer'
import type { Leftover, Piece, SheetPlan } from '@/lib/types'
import { useData } from './data'
import { useSettings } from './settings'

/** Only this client's own leftovers are ever offered as stock for their job (never pooled across clients). */
function stockForClient(freeLeftovers: Leftover[], clientId: string): Leftover[] {
  return freeLeftovers.filter((l) => l.clientId === clientId)
}

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
  /** The client this job is for. Their leftovers are the only stock ever offered to them. */
  clientId: string
  clientName: string
  /** Optional contact number, saved with the job. Never used for planning/matching. */
  clientPhone: string
  /** Optional free-text reference note, e.g. "34/66". Never parsed or validated. */
  sheetNumber: string
  plan: PlanState | null
  /** Set from Leftover detail's "Use this in a new job": restrict the next plan to this one leftover. */
  onlyLeftoverId: string | null
  /**
   * Set from Plan's "Use a new sheet instead": the normal (non-restricted) flow plans
   * with an empty stock, so only new sheets are used even though a leftover would fit.
   */
  forceNewSheet: boolean
  addPiece: (w: number, h: number, qty: number) => void
  removePiece: (id: string) => void
  setPieces: (pieces: Piece[]) => void
  setClient: (clientId: string, clientName: string) => void
  setClientPhone: (phone: string) => void
  setSheetNumber: (note: string) => void
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
  setForceNewSheet: (v: boolean) => void
}

export const useJob = create<JobState>()(
  persist(
    (set, get) => ({
      pieces: [],
      clientId: '',
      clientName: '',
      clientPhone: '',
      sheetNumber: '',
      plan: null,
      onlyLeftoverId: null,
      forceNewSheet: false,
      addPiece: (w, h, qty) =>
        set((s) => ({
          pieces: [...s.pieces, { id: uid(), w, h, qty }],
          plan: null,
          forceNewSheet: false,
        })),
      removePiece: (id) =>
        set((s) => ({
          pieces: s.pieces.filter((p) => p.id !== id),
          plan: null,
          forceNewSheet: false,
        })),
      setPieces: (pieces) => set({ pieces, plan: null, forceNewSheet: false }),
      setClient: (clientId, clientName) => set({ clientId, clientName, plan: null, forceNewSheet: false }),
      setClientPhone: (clientPhone) => set({ clientPhone }),
      setSheetNumber: (sheetNumber) => set({ sheetNumber }),
      clearJob: () =>
        set({
          pieces: [],
          clientId: '',
          clientName: '',
          clientPhone: '',
          sheetNumber: '',
          plan: null,
          onlyLeftoverId: null,
          forceNewSheet: false,
        }),
      buildPlan: (excluded = []) => {
        const { derived } = useData.getState()
        const { settings } = useSettings.getState()
        const kerf = settings.kerfOn ? settings.kerfSize : 0
        const only = get().onlyLeftoverId
        const forceNewSheet = get().forceNewSheet
        const clientStock = stockForClient(derived.freeLeftovers, get().clientId)
        const stock = only
          ? clientStock.filter((l) => l.id === only)
          : forceNewSheet
            ? []
            : clientStock
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
        const lo = stockForClient(derived.freeLeftovers, get().clientId).find((l) => l.id === only)
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
        const stock = only ? stockForClient(derived.freeLeftovers, get().clientId).filter((l) => l.id === only) : []
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
      setForceNewSheet: (v) => set({ forceNewSheet: v }),
    }),
    {
      name: 'sc-job-draft',
      partialize: (s) => ({
        pieces: s.pieces,
        clientId: s.clientId,
        clientName: s.clientName,
        clientPhone: s.clientPhone,
        sheetNumber: s.sheetNumber,
      }),
    },
  ),
)
