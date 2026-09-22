import { describe, expect, it } from 'vitest'
import { clientFolders, knownClients, resolveClient } from './clients'
import type { CutDoc } from './types'
import type { JobView } from './stock'

const cut = (id: string, clientId: string, clientName: string, createdAt: number): CutDoc => ({
  id,
  type: 'cut',
  createdAt,
  syncedAt: createdAt,
  deviceId: 'd',
  sheets: [],
  clientId,
  clientName,
})

const jobView = (cutDoc: CutDoc): JobView => ({ cut: cutDoc, status: 'active' })

describe('resolveClient', () => {
  it('reuses an existing client by case-insensitive name match', () => {
    const known = [{ id: 'c1', name: 'Ali' }]
    expect(resolveClient('ali', known)).toEqual({ id: 'c1', name: 'Ali' })
    expect(resolveClient('  ALI  ', known)).toEqual({ id: 'c1', name: 'Ali' })
  })

  it('mints a new id for an unseen name', () => {
    const result = resolveClient('Bilal', [{ id: 'c1', name: 'Ali' }])
    expect(result.name).toBe('Bilal')
    expect(result.id).not.toBe('c1')
  })
})

describe('knownClients', () => {
  it('returns one entry per distinct client, newest first', () => {
    const cuts = [cut('a', 'c1', 'Ali', 1), cut('b', 'c2', 'Bilal', 5), cut('c', 'c1', 'Ali', 3)]
    expect(knownClients(cuts)).toEqual([
      { id: 'c2', name: 'Bilal' },
      { id: 'c1', name: 'Ali' },
    ])
  })
})

describe('clientFolders', () => {
  it('groups jobs by client with a job count and last activity', () => {
    const jobs = [
      jobView(cut('a', 'c1', 'Ali', 1)),
      jobView(cut('b', 'c1', 'Ali', 5)),
      jobView(cut('c', 'c2', 'Bilal', 3)),
    ]
    const folders = clientFolders(jobs)
    expect(folders).toEqual([
      { id: 'c1', name: 'Ali', jobCount: 2, lastActivity: 5 },
      { id: 'c2', name: 'Bilal', jobCount: 1, lastActivity: 3 },
    ])
  })

  it('a client with no clientId falls back to the Unassigned bucket', () => {
    const bare: CutDoc = { id: 'a', type: 'cut', createdAt: 1, syncedAt: 1, deviceId: 'd', sheets: [] }
    const folders = clientFolders([jobView(bare)])
    expect(folders).toEqual([{ id: 'unassigned', name: 'Unassigned', jobCount: 1, lastActivity: 1 }])
  })
})
