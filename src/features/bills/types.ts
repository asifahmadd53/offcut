import type { BillLine } from '@/components/BillShareDialog'

export type Status = 'unpaid' | 'paid'

export interface SavedBill {
    id: string
    client: string
    createdAt: number // time in ms
    lines: BillLine[]
    tapeTotal: number
    cutting: number
    total: number
    status?: Status
    paidAt?: number | null
    hidden?: boolean
    /** Only on bills saved by the first test version. No longer used. */
    paid?: number
    number?: number
    fare?: number
    pending?: boolean
}

export function statusOf(b: SavedBill): Status {
    if (b.status === 'paid' || b.status === 'unpaid') return b.status
    // Old bills: fully paid counts as paid, everything else as unpaid.
    return (b.paid ?? 0) >= b.total && b.total > 0 ? 'paid' : 'unpaid'
}

export const MONTHS_FULL = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
]

export const dateText = (ms: number) =>
    new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

export const dateTimeText = (ms: number) =>
    new Date(ms).toLocaleString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
    })

export const monthTitle = (ms: number) => {
    const d = new Date(ms)
    return `${MONTHS_FULL[d.getMonth()]} ${d.getFullYear()}`
}