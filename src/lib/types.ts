/** All sizes are in inches. Sheets are `sheetW` wide (48) and `sheetH` tall (96). */

export interface Piece {
  id: string
  w: number
  h: number
  qty: number
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** One piece placed on a sheet (coordinates are inside the original full sheet). */
export interface Placed extends Rect {
  /** Piece number in the job, starting at 1. */
  n: number
  pieceId: string
  /** The size as the user typed it, for example "19 × 22". */
  label: string
  /** True when the piece was turned 90 degrees to fit. */
  rotated: boolean
}

/** A free area that will be saved to stock after the cut is confirmed. */
export interface LeftoverRect extends Rect {
  id: string
  /** Short name on the diagram: A, B, A2 ... */
  letter: string
}

/** What happens on one physical sheet (a new one, or a saved leftover) for a job. */
export interface SheetPlan {
  /** Id of the physical sheet. A leftover keeps the id of the sheet it came from. */
  sheetId: string
  sheetW: number
  sheetH: number
  /** When the physical sheet was first cut (ms). */
  sheetDate: number
  isNew: boolean
  /** True for leftovers added by hand (the parent sheet is unknown). */
  manual?: boolean
  usedLeftoverId?: string
  usedLetter?: string
  /** The area that is worked on: the whole sheet, or the leftover rectangle. */
  region: Rect
  placements: Placed[]
  newLeftovers: LeftoverRect[]
  /** Cut order, measured from the top-left corner of `region`. */
  steps: string[]
  /**
   * Structured cut-line data paralleling `steps` exactly (cuts[i].n === i + 1, same
   * semantic meaning as steps[i]). Optional so older saved records without it still work.
   */
  cuts?: Array<{ n: number; kind: 'across' | 'down'; pos: number; from: number; to: number }>
}

export interface Leftover extends Rect {
  id: string
  letter: string
  sheetId: string
  sheetW: number
  sheetH: number
  sheetDate: number
  createdByCutId: string
  createdAt: number
  manual: boolean
  status: 'free' | 'used'
  usedByCutId?: string
  /** Whose stock this leftover belongs to. Never offered to any other client's job. */
  clientId: string
  clientName: string
}

export type CutType = 'cut' | 'manual' | 'discard'

/**
 * One record in the append-only history. Stock is never edited in place:
 * it is always calculated from these records (see stock.ts).
 */
export interface CutDoc {
  id: string
  type: CutType
  /** Time on the phone that made the record (ms). */
  createdAt: number
  /** Time the server received it (ms). Null while it is still waiting to sync. */
  syncedAt: number | null
  deviceId: string
  pieces?: Piece[]
  kerf?: number
  sheets: SheetPlan[]
  discardIds?: string[]
  /** Who this job/leftover-add/discard is for. Missing on older records (see UNASSIGNED_CLIENT_ID). */
  clientId?: string
  clientName?: string
}

export type Resolution = 'voided' | 'kept'

export interface Settings {
  /** Sheet width in inches (48). */
  sheetW: number
  /** Sheet length in inches (96). */
  sheetH: number
  kerfOn: boolean
  /** Blade thickness in inches (1/8). */
  kerfSize: number
  /** Leftovers with a side shorter than this are treated as waste. */
  minLeftover: number
  /** Paper size used for the print pages. */
  paperSize: 'A4' | 'Letter'
}

/** Bucket for jobs/leftovers recorded before per-client tracking existed. */
export const UNASSIGNED_CLIENT_ID = 'unassigned'
export const UNASSIGNED_CLIENT_NAME = 'Unassigned'

export const DEFAULT_SETTINGS: Settings = {
  sheetW: 48,
  sheetH: 96,
  kerfOn: false,
  kerfSize: 0.125,
  minLeftover: 1,
  paperSize: 'A4',
}
