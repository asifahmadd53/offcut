import { statusOf, type SavedBill } from './types'

const two = (n: number) => String(n).padStart(2, '0')

function isoDate(ms: number): string {
    const d = new Date(ms)
    return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`
}

function clock(ms: number): string {
    const d = new Date(ms)
    return `${two(d.getHours())}:${two(d.getMinutes())}`
}

// Text cell: quoted, quotes doubled, line breaks removed, and never starts like an Excel formula.
function text(value: string): string {
    let s = value.replace(/\r?\n/g, ' ')
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
    return `"${s.replace(/"/g, '""')}"`
}

const money = (n: number) => String(Math.round(n * 100) / 100)

/** Downloads the given bills as a CSV file. `label` describes the filter and goes into the file name. */
export function exportBillsCsv(bills: SavedBill[], label: string): void {
    const header = ['Date', 'Time', 'Client', 'Items', 'Edge tape (Rs)', 'Cutting (Rs)', 'Total (Rs)', 'Status', 'Paid on']
        .map(text)
        .join(',')

    const rows = bills.map((b) => {
        const items = b.lines
            .map((l) => `${l.item}${l.type && l.type !== '—' ? ` (${l.type})` : ''}: ${l.qty} x ${l.rate}`)
            .join(' | ')
        const status = statusOf(b)
        return [
            isoDate(b.createdAt),
            clock(b.createdAt),
            text(b.client || 'No name'),
            text(items),
            money(b.tapeTotal),
            money(b.cutting),
            money(b.total),
            text(status === 'paid' ? 'Paid' : 'Unpaid'),
            b.paidAt ? isoDate(b.paidAt) : '',
        ].join(',')
    })

    const csv = '\uFEFF' + [header, ...rows].join('\r\n') + '\r\n'
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })

    const safeLabel = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'all'
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `bills-${safeLabel}-${isoDate(Date.now())}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1500)
}