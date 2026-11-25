import { useEffect, useMemo, useState } from 'react'
import { IconCalendar, IconX } from '@tabler/icons-react'
import { IconDownload, IconLoader2, IconSearch } from '@tabler/icons-react'
import { toast } from 'sonner'
import { AppShell } from '@/components/AppShell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { BillRow } from './BillRow'
import { exportBillsExcel } from './exportExcel'
import { DateRangeDialog, dayKey, nextDay, rangeText, type DateRange } from './DateRangeDialog'
import { monthTitle, statusOf, type SavedBill, type Status } from './types'
import { watchBills } from './billsStore'
import { money, useBillsLock } from './billsLock'
import { LockBar } from './BillsLockPanel'

const PAGE = 30

const STATUS_TABS: { value: '' | Status; label: string; key: 'all' | 'unpaid' | 'paid' }[] = [
    { value: '', label: 'All', key: 'all' },
    { value: 'unpaid', label: 'Unpaid', key: 'unpaid' },
    { value: 'paid', label: 'Paid', key: 'paid' },
]

const two = (n: number) => String(n).padStart(2, '0')
const isoDay = (ms: number) => {
    const d = new Date(ms)
    return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`
}


// The page opens on the current month, so old bills are not loaded until you ask for them.
const thisMonth = (): DateRange => {
    const n = new Date()
    return {
        from: new Date(n.getFullYear(), n.getMonth(), 1).getTime(),
        to: new Date(n.getFullYear(), n.getMonth() + 1, 0).getTime(),
    }
}

export default function BillsPage() {
    const [bills, setBills] = useState<SavedBill[] | null>(null) // null = still loading
    const [error, setError] = useState('')
    const [q, setQ] = useState('')
    const [range, setRange] = useState<DateRange>(thisMonth)
    const [calendarOpen, setCalendarOpen] = useState(false)
    const [status, setStatus] = useState<'' | Status>('')
    const [visible, setVisible] = useState(PAGE)
    const [exporting, setExporting] = useState(false)
    const unlocked = useBillsLock()

    useEffect(() => {
        setBills(null)
        return watchBills(
            (list) => {
                setBills(list.filter((b) => !b.hidden))
                setError('')
            },
            (err) => {
                console.error(err)
                setError('Could not load your bills. Check your internet and try again.')
            },
            { from: range.from, toExclusive: range.to !== null ? nextDay(range.to) : null },
        )
    }, [range])

    // Any change of search or filter starts the list from the top again.
    useEffect(() => {
        setVisible(PAGE)
    }, [q, range, status])

    // Days that have bills get a dot in the calendar.
    const marked = useMemo(() => new Set((bills ?? []).map((b) => dayKey(b.createdAt))), [bills])

    // Bills that match the search and the dates. The status tabs then split these.
    const matching = useMemo(() => {
        const needle = q.trim().toLowerCase()
        const digits = needle.replace(/[,\s]/g, '')
        const endExclusive = range.to !== null ? nextDay(range.to) : null
        return (bills ?? []).filter((b) => {
            if (needle) {
                const byName = (b.client || 'no name').toLowerCase().includes(needle)
                const byAmount = /^\d+$/.test(digits) && String(Math.round(b.total)).includes(digits)
                if (!byName && !byAmount) return false
            }
            if (range.from !== null && b.createdAt < range.from) return false
            if (endExclusive !== null && b.createdAt >= endExclusive) return false
            return true
        })
    }, [bills, q, range])

    const shown = useMemo(
        () => (status ? matching.filter((b) => statusOf(b) === status) : matching),
        [matching, status],
    )

    const counts = useMemo(
        () => ({
            all: matching.length,
            unpaid: matching.filter((b) => statusOf(b) === 'unpaid').length,
            paid: matching.filter((b) => statusOf(b) === 'paid').length,
        }),
        [matching],
    )
    const groups = useMemo(() => {
        const out: { title: string; items: SavedBill[] }[] = []
        for (const b of shown.slice(0, visible)) {
            const title = monthTitle(b.createdAt)
            const last = out[out.length - 1]
            if (last && last.title === title) last.items.push(b)
            else out.push({ title, items: [b] })
        }
        return out
    }, [shown, visible])

    const billed = shown.reduce((s, b) => s + b.total, 0)
    const received = shown.reduce((s, b) => s + (statusOf(b) === 'paid' ? b.total : 0), 0)
    const unpaid = billed - received

    async function handleExport() {
        if (exporting) return
        if (!unlocked) {
            toast.error('Show the amounts first to export.')
            return
        }
        if (shown.length === 0) {
            toast.error('No bills to export.')
            return
        }
        const dates = range.from !== null && range.to !== null ? `${isoDay(range.from)}-to-${isoDay(range.to)}` : ''
        const label = [dates, status, q.trim() ? 'search' : ''].filter(Boolean).join('-')
        setExporting(true)
        try {
            await exportBillsExcel(shown, label)
            toast.success(`Exported ${shown.length} ${shown.length === 1 ? 'bill' : 'bills'}.`)
        } catch (err) {
            console.error(err)
            toast.error("Couldn't export the bills. Try again.")
        } finally {
            setExporting(false)
        }
    }

    const box = 'min-w-0 rounded-lg bg-black/[0.04] p-3 dark:bg-white/[0.06]'
    const dateActive = range.from !== null

    return (
        <AppShell title="Bills" tab="bills">
            <LockBar unlocked={unlocked} />
            <div className="mb-3 grid grid-cols-3 gap-2.5">
                <div className={box}>
                    <p className="mb-0 text-[12px] text-muted-foreground">Billed</p>
                    <p className={`mb-0 break-words text-[15px] sm:text-[17px] ${unlocked ? 'font-semibold' : 'font-normal text-muted-foreground'}`}>
                        {money(unlocked, billed)}
                    </p>
                </div>
                <div className={box}>
                    <p className="mb-0 text-[12px] text-muted-foreground">Received</p>
                    <p
                        className={`mb-0 break-words text-[15px] sm:text-[17px] ${unlocked ? 'font-semibold text-green-700 dark:text-green-400' : 'font-normal text-muted-foreground'
                            }`}
                    >
                        {money(unlocked, received)}
                    </p>
                </div>
                <div className={box}>
                    <p className="mb-0 text-[12px] text-muted-foreground">Unpaid</p>
                    <p
                        className={`mb-0 break-words text-[15px] sm:text-[17px] ${unlocked ? 'font-semibold text-amber-700 dark:text-amber-400' : 'font-normal text-muted-foreground'
                            }`}
                    >
                        {money(unlocked, unpaid)}
                    </p>
                </div>
            </div>
            <div className="mb-3 flex items-center gap-2">
                <div className="relative min-w-0 flex-1">
                    <IconSearch
                        size={18}
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    />
                    <Input
                        placeholder="Search by client name or amount"
                        autoComplete="off"
                        className="h-[44px] w-full border border-border-stronger bg-transparent pl-10 pr-3 text-[16px]"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                    />
                </div>
                <Button
                    size="lg"
                    variant="outline"
                    className="h-[44px] flex-none gap-2 px-3 sm:px-4"
                    disabled={exporting || shown.length === 0 || !unlocked}
                    onClick={handleExport}
                    aria-label={`Export ${shown.length} ${shown.length === 1 ? 'bill' : 'bills'} to Excel`}
                >
                    {exporting ? <IconLoader2 size={18} className="animate-spin" /> : <IconDownload size={18} />}
                    <span className="hidden sm:inline">Export to Excel</span>
                    <span className="rounded-full bg-black/[0.07] px-2 py-0.5 text-[12px] font-semibold dark:bg-white/[0.12]">
                        {shown.length}
                    </span>
                </Button>
            </div>

            <div className="mb-2.5 flex gap-2">
                <button
                    type="button"
                    onClick={() => setCalendarOpen(true)}
                    className={`flex h-[44px] min-w-0 flex-1 items-center gap-2 rounded-lg border px-3 text-left text-[15px] transition-colors ${dateActive
                            ? 'border-accent-border bg-accent-bg text-accent-text'
                            : 'border-border-stronger bg-background text-foreground hover:bg-muted'
                        }`}
                >
                    <IconCalendar size={18} className="flex-none" />
                    <span className="truncate">{rangeText(range)}</span>
                </button>
                {dateActive && (
                    <button
                        type="button"
                        aria-label="Clear dates"
                        onClick={() => setRange({ from: null, to: null })}
                        className="flex h-[44px] w-[44px] flex-none items-center justify-center rounded-lg border border-border-stronger text-muted-foreground hover:bg-muted"
                    >
                        <IconX size={18} />
                    </button>
                )}
            </div>

            <div role="tablist" aria-label="Status" className="mb-4 flex border-b border-border">
                {STATUS_TABS.map((t) => {
                    const selected = status === t.value
                    return (
                        <button
                            key={t.key}
                            type="button"
                            role="tab"
                            aria-selected={selected}
                            onClick={() => setStatus(t.value)}
                            className={`-mb-px flex flex-1 items-center justify-center gap-2 border-b-2 px-3 py-3 text-[14.5px] transition-colors ${selected
                                ? 'border-accent-text font-semibold text-foreground'
                                : 'border-transparent text-muted-foreground hover:text-foreground'
                                }`}
                        >
                            {t.label}
                            <span
                                className={`rounded-full px-2 py-0.5 text-[11.5px] font-medium ${selected ? 'bg-accent-bg text-accent-text' : 'bg-muted text-muted-foreground'
                                    }`}
                            >
                                {counts[t.key]}
                            </span>
                        </button>
                    )
                })}
            </div>



            {error && <p className="mb-3 text-[13px] text-danger-text">{error}</p>}

            {bills === null && !error && (
                <p className="mt-8 text-center text-[14px] text-muted-foreground">Loading your bills…</p>
            )}

            {bills !== null && bills.length === 0 && (
                <div className="mt-8 text-center">
                    <p className="mb-1 text-[16px] font-semibold">Save your first bill</p>
                    <p className="text-[14px] text-muted-foreground">
                        Make a bill on the Billing page and tap Print, save or share. It is saved here automatically.
                    </p>
                </div>
            )}

            {bills !== null && bills.length > 0 && shown.length === 0 && (
                <p className="mt-8 text-center text-[14px] text-muted-foreground">No bills match these filters.</p>
            )}

            {groups.map((g) => (
                <div key={g.title} className="mb-3">
                    <p className="mb-2 mt-1 text-[13px] font-semibold text-muted-foreground">{g.title}</p>
                    {g.items.map((b) => (
                        <BillRow key={b.id} bill={b} unlocked={unlocked} />
                    ))}
                </div>
            ))}

            {shown.length > visible && (
                <Button variant="outline" size="lg" className="mb-3 w-full" onClick={() => setVisible((v) => v + PAGE)}>
                    Show more ({shown.length - visible} left)
                </Button>
            )}

            {bills !== null && bills.length > 0 && (
                <p className="mb-0 mt-2 text-[12px] text-faint">
                    {shown.length} of {bills.length} bills
                </p>
            )}

            <DateRangeDialog
                open={calendarOpen}
                onOpenChange={setCalendarOpen}
                value={range}
                onApply={setRange}
                marked={marked}
            />
        </AppShell>

    )
}