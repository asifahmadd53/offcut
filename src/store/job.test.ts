import { beforeEach, describe, expect, it } from 'vitest'
import { packJob } from '@/lib/packer'
import { deriveStock } from '@/lib/stock'
import type { CutDoc } from '@/lib/types'
import { useData } from './data'
import { useJob } from './job'

/**
 * A client's saved leftovers are only ever offered to that same client id. Typing a name
 * that was used before creates a new client id (see newClient), so it must get a brand-new
 * sheet rather than the earlier job's leftover.
 */
describe('leftovers are isolated by client id', () => {
  beforeEach(() => {
    const first = packJob([{ id: 'p', w: 23, h: 77, qty: 2 }], [], {
      sheetW: 48,
      sheetH: 96,
      kerf: 0,
      minLeftover: 1,
    })
    const cut: CutDoc = {
      id: 'cut-1',
      type: 'cut',
      createdAt: 1,
      syncedAt: 1,
      deviceId: 'd',
      sheets: first.sheets,
      clientId: 'asif-1',
      clientName: 'Asif',
    }
    useData.setState({ derived: deriveStock([cut]) })
    useJob.setState({
      pieces: [{ id: 'q', w: 19, h: 22, qty: 1 }],
      plan: null,
      onlyLeftoverId: null,
      forceNewSheet: false,
    })
  })

  it('the same client id is offered its own saved leftover', () => {
    useJob.setState({ clientId: 'asif-1', clientName: 'Asif' })
    useJob.getState().buildPlan()
    expect(useJob.getState().plan?.sheets[0].isNew).toBe(false)
  })

  it('a second client also called "Asif" (different id) never gets that leftover', () => {
    useJob.setState({ clientId: 'asif-2', clientName: 'Asif' })
    useJob.getState().buildPlan()
    expect(useJob.getState().plan?.sheets[0].isNew).toBe(true)
  })
})
