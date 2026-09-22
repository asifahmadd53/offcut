import { uid } from './id'
import { UNASSIGNED_CLIENT_ID, UNASSIGNED_CLIENT_NAME, type CutDoc } from './types'
import type { JobView } from './stock'

export interface ClientOption {
  id: string
  name: string
}

/** Every distinct client seen across jobs, newest first, "Unassigned" excluded unless it has jobs. */
export function knownClients(cuts: CutDoc[]): ClientOption[] {
  const seen = new Map<string, { name: string; latest: number }>()
  for (const cut of cuts) {
    const id = cut.clientId || UNASSIGNED_CLIENT_ID
    const name = cut.clientName || UNASSIGNED_CLIENT_NAME
    const existing = seen.get(id)
    if (!existing || cut.createdAt > existing.latest) {
      seen.set(id, { name, latest: cut.createdAt })
    }
  }
  return [...seen.entries()]
    .sort((a, b) => b[1].latest - a[1].latest)
    .map(([id, v]) => ({ id, name: v.name }))
}

export interface ClientFolder extends ClientOption {
  jobCount: number
  lastActivity: number
}

/** One folder per client with jobs, newest activity first — for a Home "Recent jobs" folder list. */
export function clientFolders(jobs: JobView[]): ClientFolder[] {
  const byClient = new Map<string, ClientFolder>()
  for (const j of jobs) {
    const id = j.cut.clientId || UNASSIGNED_CLIENT_ID
    const name = j.cut.clientName || UNASSIGNED_CLIENT_NAME
    const existing = byClient.get(id)
    if (existing) {
      existing.jobCount += 1
      existing.lastActivity = Math.max(existing.lastActivity, j.cut.createdAt)
    } else {
      byClient.set(id, { id, name, jobCount: 1, lastActivity: j.cut.createdAt })
    }
  }
  return [...byClient.values()].sort((a, b) => b.lastActivity - a.lastActivity)
}

/** Typing a name that matches a previous client (case-insensitive) reuses their stock; a new name starts an isolated pool. */
export function resolveClient(name: string, known: ClientOption[]): ClientOption {
  const trimmed = name.trim()
  const match = known.find((c) => c.name.toLowerCase() === trimmed.toLowerCase())
  if (match) return match
  return { id: uid(), name: trimmed }
}
