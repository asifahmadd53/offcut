import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
    IconCheck,
    IconClock,
    IconCut,
    IconLoader2,
    IconPlus,
    IconPrinter,
    IconRuler2,
    IconTrash,
    IconTruck,
} from '@tabler/icons-react'
import { toast } from 'sonner'
import { AppShell } from '@/components/AppShell'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { plain, rs, USUAL_CUT_RATE, USUAL_TAPE_RATE } from '@/lib/bill'
import { BillShareDialog, type BillLine } from '@/components/BillShareDialog'
import { saveBill } from '@/features/bills/billsStore'
import { PrintableBill, printBill } from '@/features/bills/PrintableBill'

// True on screens 768px and wider. Phones get false, so no sticky bar is made there.
function useIsWide() {
    const query = '(min-width: 768px)'
    const [wide, setWide] = useState(() => window.matchMedia(query).matches)
    useEffect(() => {
        const m = window.matchMedia(query)
        const on = () => setWide(m.matches)
        m.addEventListener('change', on)
        return () => m.removeEventListener('change', on)
    }, [])
    return wide
}

const TAPE_TYPES = [
    { id: 'wide', name: 'Wide', size: '1-1/2' },
    { id: 'narrow', name: 'Narrow', size: '3/4' },
] as const

const TAPE_RATES: Record<TapeType, string> = {
    wide: '70',    // 1-1/2 inch
    narrow: '35',  // 3/4 inch
}

type TapeType = (typeof TAPE_TYPES)[number]['id']

interface TapeLine {
    id: number
    type: TapeType
    feet: string
    rate: string
}

interface Draft {
    client: string
    tapes: TapeLine[]
    sheets: string
    cutRate: string
    fare: string
}

let nextId = 1
const newTape = (): TapeLine => ({
    id: nextId++,
    type: 'wide',
    feet: '',
    rate: TAPE_RATES.wide,
})

const makeFresh = (): Draft => ({
    client: '',
    tapes: [newTape()],
    sheets: '',
    cutRate: String(USUAL_CUT_RATE),
    fare: '',
})

interface Receipt {
    client: string
    lines: BillLine[]
    total: number
    at: number
}

// Text to a safe number: empty or invalid becomes 0.
function toNum(s: string): number {
    const n = parseFloat(s)
    return Number.isFinite(n) && n > 0 ? n : 0
}

// Digits and one decimal point only. A comma from some phone keypads becomes a dot.
function cleanNumber(raw: string): string {
    let v = raw.replace(/,/g, '.').replace(/[^0-9.]/g, '')
    const firstDot = v.indexOf('.')
    if (firstDot !== -1) {
        v = v.slice(0, firstDot + 1) + v.slice(firstDot + 1).replace(/\./g, '')
    }
    if (v.startsWith('.')) v = '0' + v
    return v
}

function typeLabel(id: TapeType): string {
    const t = TAPE_TYPES.find((x) => x.id === id)!
    return `${t.size} inch (${t.name})`
}

function NumberField({
    id,
    label,
    value,
    onChange,
    prefix,
    hint,
    placeholder,
}: {
    id: string
    label: string
    value: string
    onChange: (v: string) => void
    prefix?: string
    hint?: string
    placeholder?: string
}) {
    return (
        <div>
            <Label htmlFor={id}>{label}</Label>
            <div className="relative">
                {prefix && (
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[14px] text-muted-foreground">
                        {prefix}
                    </span>
                )}
                <Input
                    id={id}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    enterKeyHint="done"
                    placeholder={placeholder}
                    className={`h-[44px] border border-border-stronger bg-transparent text-[18px] ${prefix ? 'pl-9 pr-3' : 'px-3'}`}
                    value={value}
                    onChange={(e) => onChange(cleanNumber(e.target.value))}
                    onBlur={() => onChange(value.replace(/\.$/, ''))}
                />
            </div>
            {hint && <p className="mb-0 mt-1 text-[12px] text-faint">{hint}</p>}
        </div>
    )
}

/** One switch: off = pay later (default), on = paid now. After the bill is saved it only says what was saved. */
function PaymentChoice({
    paid,
    onChange,
    locked,
}: {
    paid: boolean
    onChange: (paid: boolean) => void
    locked: boolean
}) {
    if (locked) {
        return (
            <p className="mb-0 mt-2.5 text-[12.5px] text-muted-foreground">
                Saved as {paid ? 'paid' : 'unpaid'}.
            </p>
        )
    }

    const handleChange = (next: boolean) => {
        if (next === paid) return
        onChange(next)
        if (next) toast.success('Bill marked as paid.', { id: 'paid-toggle' })
        else toast.info('Bill marked as unpaid.', { id: 'paid-toggle' })
    }

    const base =
        'flex h-8 items-center justify-center gap-1.5 rounded-md border text-[13px] font-semibold ' +
        'transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent-text/40'

    return (
        <div className="mt-2.5">
            <p className="mb-1.5 text-[12px] font-medium text-muted-foreground">Payment status</p>

            <div
                role="radiogroup"
                aria-label="Payment status"
                className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-black/[0.04] p-1 dark:bg-white/[0.05]"
            >
                <button
                    type="button"
                    role="radio"
                    aria-checked={paid}
                    onClick={() => handleChange(true)}
                    className={`${base} ${paid
                            ? 'border-green-600/60 bg-background text-green-700 shadow-sm dark:border-green-500/60 dark:text-green-400'
                            : 'border-transparent text-muted-foreground hover:text-foreground'
                        }`}
                >
                    <IconCheck size={16} stroke={2.5} />
                    Paid
                </button>

                <button
                    type="button"
                    role="radio"
                    aria-checked={!paid}
                    onClick={() => handleChange(false)}
                    className={`${base} ${!paid
                            ? 'border-amber-500/60 bg-background px-2 text-amber-700 shadow-sm dark:border-amber-400/60 dark:text-amber-400'
                            : 'border-transparent px-2 text-muted-foreground hover:text-foreground'
                        }`}
                >
                    <IconClock size={16} stroke={2.2} />
                    Pay later
                </button>
            </div>
        </div>
    )
}

function TotalCard({
    totals,
    onPrint,
    saving,
    paid,
    onPaidChange,
    paidLocked,
    className,
}: {
    totals: { total: number; tape: number; cutting: number; fare: number }
    onPrint: () => void
    saving: boolean
    paid: boolean
    onPaidChange: (paid: boolean) => void
    paidLocked: boolean
    className?: string
}) {
    return (
        <div className={`rounded-lg border border-border px-4 py-2 text-foreground ${className ?? ''}`}>
            <div className="flex items-center justify-between">
                <p className="mb-0 text-[13px] opacity-70">Total bill</p>
                <PaymentChoice paid={paid} onChange={onPaidChange} locked={paidLocked} />
            </div>
            <p className="mb-2.5 text-[36px] font-semibold leading-tight text-[#c2410c] dark:text-primary">
                {rs(totals.total)}
            </p>

            <div className="flex justify-between text-[13px]">
                <span className="opacity-70">Edge tape</span>
                <span>{rs(totals.tape)}</span>
            </div>
            <div className="mt-1 flex justify-between text-[13px]">
                <span className="opacity-70">Cutting</span>
                <span>{rs(totals.cutting)}</span>
            </div>
            {totals.fare > 0 && (
                <div className="mt-1 flex justify-between text-[13px]">
                    <span className="opacity-70">Rickshaw fare</span>
                    <span>{rs(totals.fare)}</span>
                </div>
            )}

            <Button size="lg" className="mt-2.5 w-full" disabled={saving} onClick={onPrint}>
                {saving ? <IconLoader2 size={20} className="animate-spin" /> : <IconPrinter size={20} />}
                {saving ? 'Saving bill…' : 'Print, save or share'}
            </Button>
        </div>
    )
}

function Charge({
    icon,
    title,
    formula,
    amount,
    children,
}: {
    icon: ReactNode
    title: string
    formula: string
    amount: string
    children: ReactNode
}) {
    return (
        <div className="mb-3 rounded-lg border border-border px-2.5 py-3">
            <div className="mb-3 flex items-center gap-2 text-[15px] font-semibold">
                {icon}
                {title}
            </div>
            <div className="grid grid-cols-2 gap-2.5">{children}</div>
            <div className="mt-3 flex items-baseline justify-between border-t border-border pt-2.5">
                <span className="text-[13px] text-muted-foreground">{formula}</span>
                <span className="text-[17px] font-semibold">{amount}</span>
            </div>
        </div>
    )
}

export default function Bill() {
    const [d, setD] = useState<Draft>(makeFresh)
    const [paid, setPaid] = useState(false)
    const [shareOpen, setShareOpen] = useState(false)
    const [receipt, setReceipt] = useState<Receipt | null>(null)
    const [saving, setSaving] = useState(false)
    const savingRef = useRef(false)
    const [confirmPaid, setConfirmPaid] = useState(false)

    // Hide the whole app when printing, so only the bill below is printed.
    useEffect(() => {
        const root = document.getElementById('root')
        root?.classList.add('print:hidden')
        return () => root?.classList.remove('print:hidden')
    }, [])

    const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }))
    const updateTape = (id: number, p: Partial<TapeLine>) =>
        setD((x) => ({ ...x, tapes: x.tapes.map((t) => (t.id === id ? { ...t, ...p } : t)) }))
    const addTape = () => setD((x) => ({ ...x, tapes: [...x.tapes, newTape()] }))
    const removeTape = (id: number) =>
        setD((x) => ({ ...x, tapes: x.tapes.length > 1 ? x.tapes.filter((t) => t.id !== id) : x.tapes }))

    // Calculations
    const tapeCalcs = d.tapes.map((t) => {
        const feet = toNum(t.feet)
        const rate = toNum(t.rate)
        return { line: t, feet, rate, amount: feet * rate }
    })
    const tapeTotal = tapeCalcs.reduce((sum, x) => sum + x.amount, 0)
    const totalFeet = tapeCalcs.reduce((sum, x) => sum + x.feet, 0)
    const sheets = toNum(d.sheets)
    const cutRate = toNum(d.cutRate)
    const cutting = sheets * cutRate
    const fare = toNum(d.fare)
    const total = tapeTotal + cutting + fare
    const totals = { total, tape: tapeTotal, cutting, fare }
    const isWide = useIsWide()
    const client = d.client.trim()
    const [clientError, setClientError] = useState(false)

    // Rows used by the printed bill, the PDF and the image.
    // Tape lines with no feet and cutting with 0 sheets are skipped.
    const lines: BillLine[] = [
        ...tapeCalcs
            .filter((x) => x.feet > 0)
            .map((x) => ({
                item: 'Edge tape',
                type: typeLabel(x.line.type),
                qty: `${plain(x.feet)} ft`,
                rate: `${rs(x.rate)} per ft`,
                amount: rs(x.amount),
            })),
        ...(sheets > 0
            ? [
                {
                    item: 'Cutting',
                    type: '—',
                    qty: `${plain(sheets)} ${sheets === 1 ? 'sheet' : 'sheets'}`,
                    rate: `${rs(cutRate)} per sheet`,
                    amount: rs(cutting),
                },
            ]
            : []),
        ...(fare > 0
            ? [{ item: 'Rickshaw fare', type: '—', qty: '—', rate: '—', amount: rs(fare) }]
            : []),
    ]

    async function handlePrintShare() {
        if (savingRef.current) return

        if (!client) {
            setClientError(true)
            // Scroll to the input
            document.getElementById('bill-client')?.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
            })
            return
        }

        if (total <= 0) {
            toast.error('Add tape or sheets first.')
            return
        }

        if (paid) {
            setConfirmPaid(true)
            return
        }

        await doSave()
    }

    async function doSave() {
        if (savingRef.current) return
        savingRef.current = true
        setSaving(true)
        try {
            const at = Date.now()
            await saveBill({
                client,
                lines,
                tapeTotal,
                cutting,
                fare,
                total,
                paid,
                createdAt: at,
            })
            setReceipt({ client, lines, total, at })
            setShareOpen(true)
            toast.success(
                navigator.onLine
                    ? paid
                        ? 'Bill saved as paid.'
                        : 'Bill saved.'
                    : 'Bill saved on this device. It uploads when you are online.',
            )
        } catch (err) {
            console.error(err)
            toast.error("Couldn't save the bill. Try again. Your bill is still here.")
        } finally {
            savingRef.current = false
            setSaving(false)
        }
    }

    function handleShareOpenChange(open: boolean) {
        setShareOpen(open)
        if (!open) {
            // Clear form ready for next bill
            setD(makeFresh())
            setPaid(false)
            setReceipt(null)
        }
    }

    return (
        <AppShell
            title="Billing"
            tab="bill"
            stickyBar={
                isWide ? (
                    <TotalCard
                        totals={totals}
                        onPrint={handlePrintShare}
                        saving={saving}
                        paid={paid}
                        onPaidChange={setPaid}
                        paidLocked={false}
                        className="mb-[-.5rem] bg-black/[0.06] dark:bg-white/[0.08]"
                    />
                ) : undefined
            }
        >
            <div className="mb-3">
                <Label htmlFor="bill-client">Client name</Label>
                <Input
                    id="bill-client"
                    placeholder="e.g. Ali"
                    autoComplete="off"
                    className={`h-[44px] border bg-transparent px-3 text-[16px] ${clientError
                            ? 'border-red-500 focus-visible:ring-red-500/30'
                            : 'border-border-stronger'
                        }`}
                    value={d.client}
                    onChange={(e) => {
                        set({ client: e.target.value })
                        if (clientError) setClientError(false)
                    }}
                />
                {clientError && (
                    <p className="mb-0 mt-1.5 text-[12px] text-red-600 dark:text-red-400">
                        Client name is required
                    </p>
                )}
            </div>

            <Charge
                icon={<IconRuler2 size={20} />}
                title="Edge tape"
                formula={`${plain(totalFeet)} ft total`}
                amount={rs(tapeTotal)}
            >
                {d.tapes.map((t, i) => (
                    <div key={t.id} className="col-span-2 rounded-lg border border-border p-2.5">
                        <div className="mb-2 flex items-center justify-between">
                            <span className="text-[13px] font-semibold text-muted-foreground">Tape {i + 1}</span>
                            {d.tapes.length > 1 && (
                                <button
                                    type="button"
                                    aria-label={`Remove tape ${i + 1}`}
                                    onClick={() => removeTape(t.id)}
                                    className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
                                >
                                    <IconTrash className="text-red-700" size={17} />
                                </button>
                            )}
                        </div>

                        <div role="radiogroup" aria-label="Tape width" className="mb-2.5 grid grid-cols-2 gap-2">
                            {TAPE_TYPES.map((opt) => {
                                const selected = t.type === opt.id
                                return (
                                    <button
                                        key={opt.id}
                                        type="button"
                                        role="radio"
                                        aria-checked={selected}
                                        onClick={() =>
                                            updateTape(t.id, {
                                                type: opt.id,
                                                rate: TAPE_RATES[opt.id],
                                            })
                                        }
                                        className={`h-[38px] px-2 flex items-center justify-between rounded-lg border transition-colors ${selected
                                                ? 'border-accent-border bg-accent-bg'
                                                : 'border-border-strong bg-background hover:bg-muted'
                                            }`}
                                    >
                                        <span
                                            className={`text-[15px] font-semibold leading-tight ${selected ? 'text-accent-text' : 'text-foreground'
                                                }`}
                                        >
                                            {opt.size} inch
                                        </span>
                                        <span className="text-[12px] leading-tight text-muted-foreground">
                                            {opt.name}
                                        </span>
                                    </button>
                                )
                            })}
                        </div>

                        <div className="grid grid-cols-2 gap-2.5">
                            <NumberField
                                id={`tape-feet-${t.id}`}
                                label="Feet"
                                placeholder="15"
                                value={t.feet}
                                onChange={(v) => updateTape(t.id, { feet: v })}
                            />
                            <NumberField
                                id={`tape-rate-${t.id}`}
                                label="Rate per foot"
                                prefix="Rs"
                                hint={`(Usual rate is ${USUAL_TAPE_RATE})`}
                                value={t.rate}
                                onChange={(v) => updateTape(t.id, { rate: v })}
                            />
                        </div>
                    </div>
                ))}

                <Button variant="outline" size="lg" className="col-span-2 w-full" onClick={addTape}>
                    <IconPlus size={18} />
                    Add another tape
                </Button>
            </Charge>

            <Charge
                icon={<IconCut size={20} />}
                title="Cutting"
                formula={`${plain(sheets)} ${sheets === 1 ? 'sheet' : 'sheets'} × ${rs(cutRate)}`}
                amount={rs(cutting)}
            >
                <NumberField
                    id="bill-sheets"
                    label="Sheets (total)"
                    placeholder="30"
                    value={d.sheets}
                    onChange={(v) => set({ sheets: v })}
                />
                <NumberField
                    id="bill-cut-rate"
                    label="Rate per sheet"
                    prefix="Rs"
                    hint={`(Usual rate is ${USUAL_CUT_RATE})`}
                    value={d.cutRate}
                    onChange={(v) => set({ cutRate: v })}
                />
            </Charge>

            <Charge
                icon={<IconTruck size={20} />}
                title="Rickshaw fare"
                formula="Fixed amount"
                amount={rs(fare)}
            >
                <NumberField
                    id="bill-fare"
                    label="Fare"
                    prefix="Rs"
                    placeholder="200"
                    value={d.fare}
                    onChange={(v) => set({ fare: v })}
                />
            </Charge>

            <TotalCard
                totals={totals}
                onPrint={handlePrintShare}
                saving={saving}
                paid={paid}
                onPaidChange={setPaid}
                paidLocked={false}
                className="mb-0 block bg-black/[0.04] dark:bg-white/[0.06] md:hidden"
            />

            {/* Confirm dialog when marking as paid */}
            <Dialog open={confirmPaid} onOpenChange={setConfirmPaid}>
                <DialogContent>
                    <DialogTitle>Save as paid?</DialogTitle>
                    <DialogDescription>
                        {client || 'This bill'} · {rs(total)} will count as received. Only the owner can change it later.
                    </DialogDescription>
                    <div className="mt-4 flex gap-2.5">
                        <Button size="lg" variant="outline" className="flex-1" onClick={() => setConfirmPaid(false)}>
                            Cancel
                        </Button>
                        <Button
                            size="lg"
                            className="flex-1"
                            onClick={() => {
                                setConfirmPaid(false)
                                void doSave()
                            }}
                        >
                            Save as paid
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {receipt && (
                <>
                    <PrintableBill
                        client={receipt.client}
                        lines={receipt.lines}
                        total={receipt.total}
                        at={receipt.at}
                    />
                    <BillShareDialog
                        open={shareOpen}
                        onOpenChange={handleShareOpenChange}
                        lines={receipt.lines}
                        total={receipt.total}
                        client={receipt.client}
                        at={receipt.at}
                        onPrint={() => printBill(receipt.client)}
                    />
                </>
            )}
        </AppShell>
    )
} 