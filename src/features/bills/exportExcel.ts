import { statusOf, type SavedBill } from './types'

const two = (n: number) => String(n).padStart(2, '0')

function fileDate(ms: number): string {
    const d = new Date(ms)
    return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`
}

// Excel stores a date as the number of days since 30 Dec 1899. Working it out from the
// local year, month and day keeps the date correct in every timezone.
function excelDay(ms: number): number {
    const d = new Date(ms)
    return Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(1899, 11, 30)) / 86400000)
}

// Time of day as a fraction of a day, which Excel shows as "2:32 AM".
function dayFraction(ms: number): number {
    const d = new Date(ms)
    return (d.getHours() * 60 + d.getMinutes()) / 1440
}

const money = (n: number) => Math.round(n * 100) / 100

const DATE_FMT = 'dd mmm yyyy'
const TIME_FMT = 'h:mm AM/PM'
const MONEY_FMT = '#,##0'

/** Downloads the given bills as an Excel file. `label` describes the filter and goes into the file name. */
export async function exportBillsExcel(bills: SavedBill[], label: string): Promise<void> {
    const XLSX = await import('xlsx')

    const text = (v: string) => ({ t: 's' as const, v })
    const num = (v: number, z: string) => ({ t: 'n' as const, v, z })
    const blank = { t: 's' as const, v: '' }

    const rows: unknown[][] = [
        ['Date', 'Time', 'Client', 'Items', 'Edge tape (Rs)', 'Cutting (Rs)', 'Rickshaw (Rs)', 'Total (Rs)', 'Status', 'Paid on'].map(text),
    ]

    for (const b of bills) {
        // Short and readable: "43 ft Wide tape, 23 ft Narrow tape, 32 sheets cutting".
        const items = b.lines
            .map((l) => {
                if (l.item === 'Cutting') return `${l.qty} cutting`
                if (l.item === 'Rickshaw fare') return 'rickshaw fare'
                const kind = /\(([^)]+)\)/.exec(l.type)?.[1] // "Wide" or "Narrow"
                return `${l.qty} ${kind ? `${kind} ` : ''}tape`
            })
            .join(', ')
        const paid = statusOf(b) === 'paid'
        rows.push([
            num(excelDay(b.createdAt), DATE_FMT),
            num(dayFraction(b.createdAt), TIME_FMT),
            text(b.client || 'No name'),
            text(items),
            num(money(b.tapeTotal), MONEY_FMT),
            num(money(b.cutting), MONEY_FMT),
            num(money(b.fare ?? 0), MONEY_FMT),
            num(money(b.total), MONEY_FMT),
            text(paid ? 'Paid' : 'Unpaid'),
            paid && b.paidAt ? num(excelDay(b.paidAt), DATE_FMT) : blank,
        ])
    }

    const last = bills.length + 1 // last data row, counting the header as row 1


    const ws = XLSX.utils.aoa_to_sheet(rows)

    // Wide enough for every value, so Excel never shows ########.
    ws['!cols'] = [
        { wch: 15 }, // Date
        { wch: 11 }, // Time
        { wch: 26 }, // Client
        { wch: 85 }, // Items
        { wch: 16 }, // Edge tape
        { wch: 14 }, // Cutting
        { wch: 14 }, // Total
        { wch: 10 }, // Status
        { wch: 15 }, // Paid on
        { wch: 15 }, // Rickshaw
    ]
    ws['!autofilter'] = { ref: `A1:I${last}` }

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Bills')

    const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
    const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })

    const safeLabel = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'all'
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `bills-${safeLabel}-${fileDate(Date.now())}.xlsx`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1500)
}