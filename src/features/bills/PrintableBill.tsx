import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { rs } from '@/lib/bill'
import type { BillLine } from '@/components/BillShareDialog'

/** Opens the browser print window. The suggested PDF name is the client name. */
export function printBill(client: string) {
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

/** Hidden on screen, shown only when printing. `at` is the time the bill was made. */
export function PrintableBill({
    client,
    lines,
    total,
    at,
}: {
    client: string
    lines: BillLine[]
    total: number
    at: number
}) {
    // Hide the whole app when printing, so only the bill is printed.
    useEffect(() => {
        const root = document.getElementById('root')
        root?.classList.add('print:hidden')
        return () => root?.classList.remove('print:hidden')
    }, [])

    const when = new Date(at)
    const today = when.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    const time = when.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true })

    return createPortal(
        <>
            {/* Zero page margin removes the browser's header/footer (date, title, URL). */}
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

                <div className="mb-5 mt-6 flex items-baseline justify-between gap-6">
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
    )
}