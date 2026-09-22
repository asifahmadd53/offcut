import { UNASSIGNED_CLIENT_ID, UNASSIGNED_CLIENT_NAME, type CutDoc, type Leftover, type Resolution, type SheetPlan } from './types'

/**
 * Stock is never stored as a list that phones edit. Every phone only ADDS records
 * (a cut, a hand-added leftover, a removal). The current stock is calculated from
 * those records, so two phones can never overwrite each other.
 *
 * If two phones confirmed a cut on the same leftover, the record that reached the
 * server first wins. The other one becomes a "conflict" the user must answer:
 *   - "Re-plan this job"           -> the cut is voided, its leftovers are not counted
 *   - "I cut a different piece"    -> the cut stays, its leftovers are counted
 * Until it is answered, a conflicting cut does not add leftovers to stock.
 */

export type JobStatus = 'active' | 'conflict' | 'voided' | 'kept'

export interface ConflictInfo {
  kind: 'taken' | 'missing'
  leftoverId: string
  winnerCutId?: string
  winnerAt?: number
  leftover?: Leftover
}

export interface JobView {
  cut: CutDoc
  status: JobStatus
  conflict?: ConflictInfo
}

export interface Derived {
  /** Every leftover ever created by a counted record, free or used. */
  leftovers: Leftover[]
  freeLeftovers: Leftover[]
  /** Jobs (type "cut") newest first. */
  jobs: JobView[]
  conflicts: JobView[]
  /** Counted cuts of type "cut". */
  activeCuts: CutDoc[]
  /** Letters already used on each physical sheet. */
  sheetLetters: Map<string, Set<string>>
}

export const EMPTY_DERIVED: Derived = {
  leftovers: [],
  freeLeftovers: [],
  jobs: [],
  conflicts: [],
  activeCuts: [],
  sheetLetters: new Map(),
}

const LAST = Number.MAX_SAFE_INTEGER

function compareCuts(a: CutDoc, b: CutDoc): number {
  const sa = a.syncedAt ?? LAST
  const sb = b.syncedAt ?? LAST
  if (sa !== sb) return sa - sb
  if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

function addLeftovers(known: Map<string, Leftover>, cut: CutDoc, sheet: SheetPlan) {
  for (const n of sheet.newLeftovers) {
    known.set(n.id, {
      id: n.id,
      letter: n.letter,
      x: n.x,
      y: n.y,
      w: n.w,
      h: n.h,
      sheetId: sheet.sheetId,
      sheetW: sheet.sheetW,
      sheetH: sheet.sheetH,
      sheetDate: sheet.sheetDate,
      createdByCutId: cut.id,
      createdAt: cut.createdAt,
      manual: Boolean(sheet.manual),
      status: 'free',
      clientId: cut.clientId || UNASSIGNED_CLIENT_ID,
      clientName: cut.clientName || UNASSIGNED_CLIENT_NAME,
    })
  }
}

export function deriveStock(
  cuts: CutDoc[],
  resolutions: Record<string, Resolution> = {},
  hiddenJobIds: Set<string> = new Set(),
): Derived {
  const ordered = [...cuts].sort(compareCuts)
  const known = new Map<string, Leftover>()
  const claimedBy = new Map<string, string>()
  const jobs: JobView[] = []
  const activeCuts: CutDoc[] = []

  for (const cut of ordered) {
    if (cut.type === 'discard') {
      for (const id of cut.discardIds ?? []) {
        if (known.has(id) && !claimedBy.has(id)) {
          claimedBy.set(id, cut.id)
        }
      }
      continue
    }

    if (cut.type === 'manual') {
      for (const sheet of cut.sheets) addLeftovers(known, cut, sheet)
      continue
    }

    const usedIds = cut.sheets.flatMap((s) => (s.usedLeftoverId ? [s.usedLeftoverId] : []))
    let conflict: ConflictInfo | undefined
    for (const id of usedIds) {
      if (!known.has(id)) {
        conflict = { kind: 'missing', leftoverId: id }
        break
      }
      const winner = claimedBy.get(id)
      if (winner) {
        const winnerCut = ordered.find((c) => c.id === winner)
        conflict = {
          kind: 'taken',
          leftoverId: id,
          winnerCutId: winner,
          winnerAt: winnerCut?.syncedAt ?? winnerCut?.createdAt,
          leftover: known.get(id),
        }
        break
      }
    }

    const answer = resolutions[cut.id]
    let status: JobStatus
    if (!conflict) status = 'active'
    else if (answer === 'kept') status = 'kept'
    else if (answer === 'voided') status = 'voided'
    else status = 'conflict'

    jobs.push({ cut, status, conflict })

    if (status === 'active' || status === 'kept') {
      activeCuts.push(cut)
      for (const id of usedIds) {
        if (known.has(id) && !claimedBy.has(id)) claimedBy.set(id, cut.id)
      }
      for (const sheet of cut.sheets) addLeftovers(known, cut, sheet)
    }
  }

  const leftovers: Leftover[] = []
  const sheetLetters = new Map<string, Set<string>>()
  for (const l of known.values()) {
    const winner = claimedBy.get(l.id)
    const item: Leftover = winner
      ? { ...l, status: 'used', usedByCutId: winner }
      : { ...l, status: 'free' }
    leftovers.push(item)
    let set = sheetLetters.get(l.sheetId)
    if (!set) {
      set = new Set()
      sheetLetters.set(l.sheetId, set)
    }
    set.add(l.letter)
  }

  jobs.sort((a, b) => b.cut.createdAt - a.cut.createdAt)

  // Hiding a job only removes it from the job list. The leftovers it created were
  // already added to `known`/`leftovers` above and stay exactly as they are.
  const visibleJobs = jobs.filter((j) => !hiddenJobIds.has(j.cut.id))

  return {
    leftovers,
    freeLeftovers: leftovers.filter((l) => l.status === 'free'),
    jobs: visibleJobs,
    conflicts: visibleJobs.filter((j) => j.status === 'conflict'),
    activeCuts,
    sheetLetters,
  }
}
