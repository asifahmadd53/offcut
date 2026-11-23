import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { IconCut, IconPlus, IconPrinter, IconRuler2, IconTrash } from '@tabler/icons-react'
import { AppShell } from '@/components/AppShell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { plain, rs, USUAL_CUT_RATE, USUAL_TAPE_RATE } from '@/lib/bill'
import { BillShareDialog, type BillLine } from '@/components/BillShareDialog'

const TAPE_TYPES = [
    { id: 'wide', name: 'Wide', size: '1-1/2' },
    { id: 'narrow', name: 'Narrow', size: '3/4' },
] as const

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
}

let nextId = 1
const newTape = (): TapeLine => ({
    id: nextId++,
    type: 'wide',
    feet: '',
    rate: String(USUAL_TAPE_RATE),
})

const makeFresh = (): Draft => ({
    client: '',
    tapes: [newTape()],
    sheets: '',
    cutRate: String(USUAL_CUT_RATE),
})

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

function TotalCard({
    totals,
    onPrint,
    className,
}: {
    totals: { total: number; tape: number; cutting: number }
    onPrint: () => void
    className?: string
}) {
    return (
        <div className={`rounded-lg border border-border px-4 py-2 text-foreground ${className ?? ''}`}>
            <p className="mb-0 text-[13px] opacity-70">Total bill</p>
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
            <Button size="lg" className="mt-2.5 w-full" onClick={onPrint}>
                <IconPrinter size={20} />
                Print, save or share
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
    const [shareOpen, setShareOpen] = useState(false)

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
    const total = tapeTotal + cutting
    const totals = { total, tape: tapeTotal, cutting }

    // Rows used by the printed bill, the PDF and the image. Tape lines with no feet are skipped.
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
        {
            item: 'Cutting',
            type: '—',
            qty: `${plain(sheets)} ${sheets === 1 ? 'sheet' : 'sheets'}`,
            rate: `${rs(cutRate)} per sheet`,
            amount: rs(cutting),
        },
    ]

    const now = new Date()
    const today = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    const time = now.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true })
    const client = d.client.trim()

    const handlePrint = () => {
        const previousTitle = document.title
        document.title = client.replace(/[\\/:*?"<>|]/g, '').trim() || 'Bill'
        const restore = () => {
            document.title = previousTitle
            window.removeEventListener('afterprint', restore)
        }
        window.addEventListener('afterprint', restore)
        window.print()
    }

    const th = 'px-3 py-[11px] text-left text-[10.5pt] font-semibold uppercase tracking-[0.03em] text-[#6b6b6b]'
    const td = 'border-b border-[#e3e0da] px-3 py-4 align-top'

    return (
        <AppShell
            title="Billing"
            tab="bill"
            stickyBar={
                <TotalCard
                    totals={totals}
                    onPrint={() => setShareOpen(true)}
                    className="mb-[-.5rem] hidden bg-black/[0.06] dark:bg-white/[0.08] md:block"
                />
            }
        >
            <div className="mb-3">
                <Label htmlFor="bill-client">Client name (optional)</Label>
                <Input
                    id="bill-client"
                    placeholder="e.g. Ali"
                    autoComplete="off"
                    className="h-[44px] border border-border-stronger bg-transparent px-3 text-[16px]"
                    value={d.client}
                    onChange={(e) => set({ client: e.target.value })}
                />
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
                                    <IconTrash className='text-red-700' size={17} />
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
                                        onClick={() => updateTape(t.id, { type: opt.id })}
                                        className={`h-[38px] px-2 flex items-center justify-between rounded-lg border transition-colors ${selected
                                                ? 'border-accent-border bg-accent-bg'
                                                : 'border-border-strong bg-background hover:bg-muted'
                                            }`}
                                    >
                                        <span
                                            className={`text-[15px] font-semibold leading-tight ${selected ? 'text-accent-text' : 'text-foreground'}`}
                                        >
                                            {opt.size} inch
                                        </span>
                                        <span className="text-[12px] leading-tight text-muted-foreground">{opt.name}</span>
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

            <TotalCard
                totals={totals}
                onPrint={() => setShareOpen(true)}
                className="mb-3 block bg-black/[0.04] dark:bg-white/[0.06] md:hidden"
            />

            {/* Printed bill: hidden on screen, shown only when printing */}
            {createPortal(
                <>
                    {/* Zero page margin removes the browser's header/footer (date, title, URL).
                        The bill container below supplies its own padding instead. */}
                    <style>{`@page { margin: 0; }`}</style>

                    <div className="hidden w-full bg-white p-[16mm] font-sans text-[12pt] leading-[1.4] text-[#1a1a1a] [-webkit-print-color-adjust:exact] [print-color-adjust:exact] print:block">
                        <div className="mb-5 border-b border-[#e3e0da] pb-3">
                            <div className="flex items-center justify-between">
                                <div className="text-left">
                                    <div className="text-[16pt] font-bold tracking-[0.06em] text-[#111]">HAFIZ TRADER</div>
                                    <div className="mt-1 text-[10pt] text-[#666]">PVC Edge Banding &amp; Sheet Cutting</div>
                                </div>
                                <div dir="rtl" lang="ur" style={{ fontFamily: '"Noto Naskh Arabic", serif' }} className="text-right">
                                    <div className="text-[26pt] font-bold leading-[1.4] text-[#111]">حافظ ٹریڈرز</div>
                                    <div className="text-[11pt] text-[#666]">پی وی سی، ایج بینڈنگ، شیٹ کٹنگ</div>
                                </div>
                            </div>
                            <div className="mt-3 flex justify-between border-t border-[#e3e0da] pt-2 text-[10.5pt]">
                                <div>
                                    <b>0317 8281148</b> <span className="text-[#666]">· Muhammad Tayyab</span>
                                </div>
                                <div>
                                    <b>0301 8696696</b> <span className="text-[#666]">· Muhammad Irfan</span>
                                </div>
                            </div>
                        </div>
                    
                        <div className="mt-6 mb-5 flex items-baseline justify-between gap-6">
                            <div className="min-w-0 break-words text-[17pt] font-bold leading-[1.2] text-[#0f172a]">
                                Client name:{' '}
                                {client ? (
                                    client
                                ) : (
                                    <span className="inline-block h-[1em] w-[180px] border-b-[1.5px] border-[#999] align-baseline" />
                                )}
                            </div>
                            <div className="flex-none text-[10.5pt] text-[#64748b]">
                                <b className="mr-1 font-semibold text-[#14307a]">Date:</b>
                                {today} · {time}
                            </div>
                        </div>

                        <table className="w-full table-fixed border-collapse">
                            <thead>
                                <tr className="bg-[#f4f1ec]">
                                    <th className={`${th} w-[18%]`}>Item</th>
                                    <th className={`${th} w-[26%]`}>Type</th>
                                    <th className={`${th} w-[17%]`}>Quantity</th>
                                    <th className={`${th} w-[20%]`}>Rate</th>
                                    <th className={`${th} w-[19%] !text-right`}>Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                {lines.map((l, i) => (
                                    <tr key={i} className="break-inside-avoid">
                                        <td className={`${td} font-semibold`}>{l.item}</td>
                                        <td className={td}>{l.type}</td>
                                        <td className={td}>{l.qty}</td>
                                        <td className={td}>{l.rate}</td>
                                        <td className={`${td} text-right font-semibold tabular-nums`}>{l.amount}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        <div className="mt-6 flex justify-end break-inside-avoid">
                            <div className="flex min-w-[280px] items-center justify-between gap-12 rounded-[14px] bg-[#f4f1ec] px-[22px] py-4">
                                <span className="text-[12pt] font-semibold leading-none text-[#444]">Total</span>
                                <span className="text-[24pt] font-bold leading-none tabular-nums text-[#111]">{rs(total)}</span>
                            </div>
                        </div>

                        <div className="mt-12 text-center text-[10.5pt] text-[#8a8a8a]">Thank you for your business</div>
                    </div>
                </>,
                document.body,
            )}

            <BillShareDialog
                open={shareOpen}
                onOpenChange={setShareOpen}
                lines={lines}
                total={total}
                client={client}
                onPrint={handlePrint}
            />
        </AppShell>
    )
}