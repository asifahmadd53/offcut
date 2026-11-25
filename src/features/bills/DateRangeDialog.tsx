import { useEffect, useState } from 'react'
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { MONTHS_FULL } from './types'

export interface DateRange {
    from: number | null // start of the first day, in ms
    to: number | null // start of the last day, in ms
}

const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export const dayStart = (ms: number) => {
    const d = new Date(ms)
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/** Start of the day after the given day. */
export const nextDay = (ms: number) => {
    const d = new Date(ms)
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime()
}

export const dayKey = (ms: number) => {
    const d = new Date(ms)
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

const longDate = (ms: number) =>
    new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

export function rangeText(r: DateRange): string {
    if (r.from === null || r.to === null) return 'All dates'
    return r.from === r.to ? longDate(r.from) : `${longDate(r.from)} – ${longDate(r.to)}`
}

export function DateRangeDialog({
    open,
    onOpenChange,
    value,
    onApply,
    marked,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    value: DateRange
    onApply: (r: DateRange) => void
    /** Days that have at least one bill, as dayKey strings. They get a small dot. */
    marked: Set<string>
}) {
    const [draft, setDraft] = useState<DateRange>(value)
    const [view, setView] = useState(() => {
        const d = new Date(value.from ?? Date.now())
        return { y: d.getFullYear(), m: d.getMonth() }
    })

    // Start from the current filter every time the calendar opens.
    useEffect(() => {
        if (!open) return
        setDraft(value)
        const d = new Date(value.from ?? Date.now())
        setView({ y: d.getFullYear(), m: d.getMonth() })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open])

    const shift = (delta: number) => {
        const d = new Date(view.y, view.m + delta, 1)
        setView({ y: d.getFullYear(), m: d.getMonth() })
    }

    function pick(ts: number) {
        setDraft((r) => {
            // First tap, or starting over after a finished range.
            if (r.from === null || r.to !== null) return { from: ts, to: null }
            // Second tap: the earlier day is the start, the later day is the end.
            return ts < r.from ? { from: ts, to: r.from } : { from: r.from, to: ts }
        })
    }

    function preset(from: number, to: number) {
        setDraft({ from: dayStart(from), to: dayStart(to) })
        const d = new Date(from)
        setView({ y: d.getFullYear(), m: d.getMonth() })
    }

    const now = new Date()
    const today = dayStart(now.getTime())
    const thisMonth = () =>
        preset(new Date(now.getFullYear(), now.getMonth(), 1).getTime(), new Date(now.getFullYear(), now.getMonth() + 1, 0).getTime())
    const lastMonth = () =>
        preset(new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime(), new Date(now.getFullYear(), now.getMonth(), 0).getTime())

    function apply() {
        if (draft.from === null) onApply({ from: null, to: null })
        else onApply({ from: draft.from, to: draft.to ?? draft.from })
        onOpenChange(false)
    }

    function clear() {
        onApply({ from: null, to: null })
        onOpenChange(false)
    }

    // Calendar cells. The week starts on Monday.
    const lead = (new Date(view.y, view.m, 1).getDay() + 6) % 7
    const count = new Date(view.y, view.m + 1, 0).getDate()
    const cells: (number | null)[] = [
        ...Array.from({ length: lead }, () => null),
        ...Array.from({ length: count }, (_, i) => new Date(view.y, view.m, i + 1).getTime()),
    ]

    const end = draft.to ?? draft.from
    const summary =
        draft.from === null
            ? 'Tap a day, or tap two days for a range.'
            : draft.to === null
                ? `${longDate(draft.from)}. Tap another day for a range, or show this day.`
                : rangeText({ from: draft.from, to: draft.to })

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogTitle>Pick dates</DialogTitle>
                <DialogDescription>{summary}</DialogDescription>

                <div className="mt-3 flex items-center justify-between">
                    <button
                        type="button"
                        aria-label="Previous month"
                        onClick={() => shift(-1)}
                        className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-muted"
                    >
                        <IconChevronLeft size={20} />
                    </button>
                    <p className="mb-0 text-[15px] font-semibold">
                        {MONTHS_FULL[view.m]} {view.y}
                    </p>
                    <button
                        type="button"
                        aria-label="Next month"
                        onClick={() => shift(1)}
                        className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-muted"
                    >
                        <IconChevronRight size={20} />
                    </button>
                </div>

                <div className="mt-1 grid grid-cols-7 text-center text-[11.5px] text-muted-foreground">
                    {WEEK.map((w) => (
                        <div key={w} className="py-1.5">
                            {w}
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-7 gap-y-1">
                    {cells.map((ts, i) => {
                        if (ts === null) return <div key={`b${i}`} />
                        const isEdge = draft.from !== null && (ts === draft.from || ts === end)
                        const inside = draft.from !== null && end !== null && ts > draft.from && ts < end
                        const hasBill = marked.has(dayKey(ts))
                        return (
                            <button
                                key={ts}
                                type="button"
                                onClick={() => pick(ts)}
                                aria-label={longDate(ts)}
                                aria-pressed={isEdge}
                                className={`relative mx-auto flex h-10 w-10 items-center justify-center rounded-full text-[14px] transition-colors ${isEdge
                                        ? 'bg-accent-text font-semibold text-background'
                                        : inside
                                            ? 'bg-accent-bg text-accent-text'
                                            : ts === today
                                                ? 'border border-border-strong text-foreground hover:bg-muted'
                                                : 'text-foreground hover:bg-muted'
                                    }`}
                            >
                                {new Date(ts).getDate()}
                                {hasBill && (
                                    <span
                                        className={`absolute bottom-1 h-1 w-1 rounded-full ${isEdge ? 'bg-background' : 'bg-accent-text'}`}
                                    />
                                )}
                            </button>
                        )
                    })}
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2">
                    <Button variant="outline" className="h-10 px-2 text-[13px]" onClick={() => preset(today, today)}>
                        Today
                    </Button>
                    <Button variant="outline" className="h-10 px-2 text-[13px]" onClick={thisMonth}>
                        This month
                    </Button>
                    <Button variant="outline" className="h-10 px-2 text-[13px]" onClick={lastMonth}>
                        Last month
                    </Button>
                </div>

                <div className="mt-3 flex gap-2.5">
                    <Button size="lg" variant="outline" className="flex-1" onClick={clear}>
                        All dates
                    </Button>
                    <Button size="lg" className="flex-1" disabled={draft.from === null} onClick={apply}>
                        Show bills
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}