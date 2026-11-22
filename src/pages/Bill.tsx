import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { IconCut, IconPrinter, IconRuler2 } from '@tabler/icons-react'
import { AppShell } from '@/components/AppShell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { calcBill, plain, rs, USUAL_CUT_RATE, USUAL_TAPE_RATE } from '@/lib/bill'

const STORAGE_KEY = 'offcut-bill-draft'

interface Draft {
    client: string
    feet: string
    tapeRate: string
    sheets: string
    cutRate: string
}

const FRESH: Draft = {
    client: '',
    feet: '',
    tapeRate: String(USUAL_TAPE_RATE),
    sheets: '',
    cutRate: String(USUAL_CUT_RATE),
}

function loadDraft(): Draft {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        return raw ? { ...FRESH, ...JSON.parse(raw) } : FRESH
    } catch {
        return FRESH
    }
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

function NumberField({
    id,
    label,
    value,
    onChange,
    prefix,
    hint,
}: {
    id: string
    label: string
    value: string
    onChange: (v: string) => void
    prefix?: string
    hint?: string
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
        <div className="mb-3 rounded-2xl border border-border px-2.5 py-3">
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
    const [d, setD] = useState<Draft>(loadDraft)

    // Kept on the phone, so switching to another tab to look up the tape length loses nothing.
    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(d))
        } catch {
            /* storage blocked, ignore */
        }
    }, [d])

    // Hide the whole app when printing, so only the bill below is printed.
    useEffect(() => {
        const root = document.getElementById('root')
        root?.classList.add('print:hidden')
        return () => root?.classList.remove('print:hidden')
    }, [])

    const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }))
    const b = calcBill(d)

    const now = new Date()
    const today = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    const time = now.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true })
    const client = d.client.trim()

    const th = 'px-3 py-[11px] text-left text-[10.5pt] font-semibold uppercase tracking-[0.03em] text-[#6b6b6b]'
    const td = 'border-b border-[#e3e0da] px-3 py-4 align-top'

    return (
        <AppShell title="Billing" tab="bill" 
        stickyBar={
            <div className="mb-[-.5rem] rounded-2xl border border-border bg-black/[0.06] p-4 text-foreground dark:bg-white/[0.08]">
                <p className="mb-0 text-[13px] opacity-70">Total bill</p>
                <p className="mb-2.5 text-[36px] font-semibold leading-tight text-[#c2410c] dark:text-primary">{rs(b.total)}</p>
                <div className="flex justify-between text-[13px]">
                    <span className="opacity-70">Edge tape</span>
                    <span>{rs(b.tape)}</span>
                </div>
                <div className="mt-1 flex justify-between text-[13px]">
                    <span className="opacity-70">Cutting</span>
                    <span>{rs(b.cutting)}</span>
                </div>
                <Button size="lg"  className="mt-2.5 w-full" onClick={() => window.print()}>
                    <IconPrinter size={20} />
                    Print bill
                </Button>
            </div>
        }>
            <div className="mb-3">
                <Label htmlFor="bill-client">Client name (optional)</Label>
                <Input
                    id="bill-client"
                    autoComplete="off"
                    className="h-[44px] border border-border-stronger bg-transparent px-3 text-[16px]"
                    value={d.client}
                    onChange={(e) => set({ client: e.target.value })}
                />
            </div>

            <Charge
                icon={<IconRuler2 size={20} />}
                title="Edge tape"
                formula={`${plain(b.feet)} ft × ${rs(b.tapeRate)}`}
                amount={rs(b.tape)}
            >
                <NumberField id="bill-feet" label="Feet" value={d.feet} onChange={(v) => set({ feet: v })} />
                <NumberField
                    id="bill-tape-rate"
                    label={`Rate per foot`}
                    prefix="Rs"
                    hint={`(Usual rate is ${USUAL_TAPE_RATE})`}
                    value={d.tapeRate}
                    onChange={(v) => set({ tapeRate: v })}
                />
            </Charge>

            <Charge
                icon={<IconCut size={20} />}
                title="Cutting"
                formula={`${plain(b.sheets)} ${b.sheets === 1 ? 'sheet' : 'sheets'} × ${rs(b.cutRate)}`}
                amount={rs(b.cutting)}
            >
                <NumberField id="bill-sheets" label="Sheets" value={d.sheets} onChange={(v) => set({ sheets: v })} />
                <NumberField
                    id="bill-cut-rate"
                    label={`Rate per sheet`}
                    prefix="Rs"
                    hint={`(Usual rate is ${USUAL_CUT_RATE})`}
                    value={d.cutRate}
                    onChange={(v) => set({ cutRate: v })}
                />
            </Charge>

            {/* <div className="mb-3 rounded-2xl border border-border bg-black/[0.04] p-4 text-foreground dark:bg-white/[0.06]">
                <p className="mb-0 text-[13px] opacity-70">Total bill</p>
                <p className="mb-2.5 text-[36px] font-semibold leading-tight text-[#c2410c] dark:text-primary">{rs(b.total)}</p>
                <div className="flex justify-between text-[13px]">
                    <span className="opacity-70">Edge tape</span>
                    <span>{rs(b.tape)}</span>
                </div>
                <div className="mt-1 flex justify-between text-[13px]">
                    <span className="opacity-70">Cutting</span>
                    <span>{rs(b.cutting)}</span>
                </div>
            </div> */}

            {/* <Button size="lg" variant="outline" className="mb-2.5 w-full" onClick={() => window.print()}>
                <IconPrinter size={20} />
                Print bill
            </Button> */}

            {/* Printed bill: hidden on screen, shown only when printing */}
            {createPortal(
                <>
                    {/* Zero page margin removes the browser's header/footer (date, title, URL).
                        The bill container below supplies its own padding instead. */}
                    <style>{`@page { margin: 0; }`}</style>

                    <div className="hidden w-full bg-white p-[16mm] font-sans text-[12pt] leading-[1.4] text-[#1a1a1a] [-webkit-print-color-adjust:exact] [print-color-adjust:exact] print:block">
                        <div className="text-[11pt] font-bold uppercase tracking-[0.06em] text-[#c2410c]">
                            Offcut <span className="mx-1.5">·</span> Bill
                        </div>

                        <div className="mt-3 break-words text-[26pt] font-bold leading-[1.15] text-[#111]">
                            Client name:{' '}
                            {client ? (
                                client
                            ) : (
                                <span className="inline-block h-[1em] w-[220px] border-b-[1.5px] border-[#999] align-baseline" />
                            )}
                        </div>

                        <div className="mt-1.5 text-[12pt] text-[#666]">
                            {today} · {time}
                        </div>

                        <div className="my-5 h-[2px] bg-[#c2410c]" />

                        <table className="w-full table-fixed border-collapse">
                            <thead>
                                <tr className="bg-[#f4f1ec]">
                                    <th className={`${th} w-[26%]`}>Item</th>
                                    <th className={`${th} w-[22%]`}>Quantity</th>
                                    <th className={`${th} w-[26%]`}>Rate</th>
                                    <th className={`${th} w-[26%] !text-right`}>Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr className="break-inside-avoid">
                                    <td className={`${td} font-semibold`}>Edge tape</td>
                                    <td className={td}>{plain(b.feet)} ft</td>
                                    <td className={td}>{rs(b.tapeRate)} per ft</td>
                                    <td className={`${td} text-right font-semibold tabular-nums`}>{rs(b.tape)}</td>
                                </tr>
                                <tr className="break-inside-avoid">
                                    <td className={`${td} font-semibold`}>Cutting</td>
                                    <td className={td}>
                                        {plain(b.sheets)} {b.sheets === 1 ? 'sheet' : 'sheets'}
                                    </td>
                                    <td className={td}>{rs(b.cutRate)} per sheet</td>
                                    <td className={`${td} text-right font-semibold tabular-nums`}>{rs(b.cutting)}</td>
                                </tr>
                            </tbody>
                        </table>

                        <div className="mt-6 flex justify-end break-inside-avoid">
                            <div className="flex min-w-[280px] items-center justify-between gap-12 rounded-[14px] bg-[#f4f1ec] px-[22px] py-4">
                                <span className="text-[12pt] font-semibold leading-none text-[#444]">Total</span>
                                <span className="text-[24pt] font-bold leading-none tabular-nums text-[#111]">{rs(b.total)}</span>
                            </div>
                        </div>

                        <div className="mt-12 text-center text-[10.5pt] text-[#8a8a8a]">Thank you for your business</div>
                    </div>
                </>,
                document.body,
            )}
        </AppShell>
    )
}