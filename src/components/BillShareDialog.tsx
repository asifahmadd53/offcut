import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import {
    IconBrandWhatsapp,
    IconCopy,
    IconLoader2,
    IconPhoto,
    IconShare2,
    IconX,
} from '@tabler/icons-react'
import { toast } from 'sonner'
import { Button } from './ui/button'
import { rs } from '@/lib/bill'
import { useAccount } from '@/lib/account'

export interface BillLine {
    item: string
    type: string
    qty: string
    rate: string
    amount: string
}

interface BillShareDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    lines: BillLine[]
    total: number
    client: string
    at?: number
    /** Opens the browser print window (the page's existing print function). */
    onPrint: () => void
}

// Canvas needs the Urdu font loaded before drawing, or it falls back to a wrong font.
async function loadShopFonts() {
    try {
        await Promise.all([
            document.fonts.load('700 34px "Noto Naskh Arabic"', 'حافظ ٹریڈرز'),
            document.fonts.load('400 15px "Noto Naskh Arabic"', 'پی وی سی'),
        ])
    } catch {
        /* font blocked, the bill still draws */
    }
}

function safeFileName(name: string): string {
    return name
        .replace(/[\\/:*?"<>|]/g, '')
        .replace(/\s+/g, ' ')
        .replace(/^\.+|\.+$/g, '')
        .trim()
}

// Shortens text with "…" so it fits in maxWidth.
function fit(g: CanvasRenderingContext2D, text: string, maxWidth: number): string {
    if (g.measureText(text).width <= maxWidth) return text
    let t = text
    while (t.length > 1 && g.measureText(t + '…').width > maxWidth) t = t.slice(0, -1)
    return t + '…'
}

// Draws the bill on a canvas. Used for both the image and the PDF, so they look the same.
// The canvas grows taller automatically when there are more rows.

function drawBill(lines: BillLine[], total: number, client: string, at: number): HTMLCanvasElement {
    const NAVY = '#14307a'
    const INK = '#0f172a'
    const MUTED = '#64748b'
    const RULE = '#e2e8f0'

    const ROW = 58
    const TOP = 250 // table header top
    const HEAD = 36
    const START = TOP + HEAD
    const totalY = START + lines.length * ROW + 22
    const footY = totalY + 70 + 50

    const W = 800
    const H = footY + 30
    const S = 2 // 2x for sharp text
    const canvas = document.createElement('canvas')
    canvas.width = W * S
    canvas.height = H * S
    const g = canvas.getContext('2d')!
    g.scale(S, S)
    g.textBaseline = 'alphabetic'

    const font = (weight: number, size: number) => `${weight} ${size}px Poppins, system-ui, sans-serif`
    const now = new Date(at)
    const today = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    const time = now.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true })

    g.fillStyle = '#ffffff'
    g.fillRect(0, 0, W, H)

    // Shop header: English left, Urdu right
    g.textAlign = 'left'
    g.direction = 'ltr'
    g.fillStyle = NAVY
    g.font = font(700, 24)
    g.fillText('HAFIZ TRADER', 40, 62)
    g.fillStyle = MUTED
    g.font = font(400, 13)
    g.fillText('PVC Edge Banding & Sheet Cutting', 40, 88)

    g.textAlign = 'right'
    g.direction = 'rtl'
    g.fillStyle = NAVY
    g.font = '700 36px "Noto Naskh Arabic", serif'
    g.fillText('حافظ ٹریڈرز', 760, 62)
    g.fillStyle = MUTED
    g.font = '400 15px "Noto Naskh Arabic", serif'
    g.fillText('پی وی سی، ایج بینڈنگ، شیٹ کٹنگ', 760, 92)
    g.direction = 'ltr'

    g.fillStyle = NAVY
    g.fillRect(40, 108, 720, 2)

    // Phone numbers
    g.textAlign = 'left'
    g.fillStyle = INK
    g.font = font(600, 14)
    g.fillText('0317 8281148', 40, 136)
    const w1 = g.measureText('0317 8281148').width
    g.fillStyle = MUTED
    g.font = font(400, 13)
    g.fillText('· Muhammad Tayyab', 40 + w1 + 10, 136)

    g.textAlign = 'right'
    g.font = font(400, 13)
    const irfan = '· Muhammad Irfan'
    const iw = g.measureText(irfan).width
    g.fillStyle = MUTED
    g.fillText(irfan, 760, 136)
    g.fillStyle = INK
    g.font = font(600, 14)
    g.fillText('0301 8696696', 760 - iw - 10, 136)

    g.fillStyle = RULE
    g.fillRect(40, 150, 720, 1)

    // Client name (left) + date (right)
    // Client name on one line (left) + date (right)
    // Client name (left) and date (right), same line, same style
    // Client name (left) and date (right): label and name look exactly the same
    g.textBaseline = 'alphabetic'
    g.textAlign = 'left'
    g.fillStyle = INK
    g.font = font(700, 22)
    const label = 'Client name: '
    g.fillText(label, 40, 210)
    const labelW = g.measureText(label).width
    g.fillText(fit(g, client || '____________', 380 - labelW), 40 + labelW, 210)

    g.textAlign = 'right'
    g.font = font(400, 14)
    const dateTxt = `${today} · ${time}`
    const dw = g.measureText(dateTxt).width
    g.fillStyle = MUTED
    g.fillText(dateTxt, 760, 210)
    g.fillStyle = NAVY
    g.font = font(600, 14)
    g.fillText('Date:', 760 - dw - 8, 210)

    // Table header
    g.fillStyle = '#eef2ff'
    g.fillRect(40, TOP, 720, HEAD)
    g.fillStyle = NAVY
    g.font = font(700, 11)
    g.textAlign = 'left'
    g.fillText('ITEM', 54, TOP + 23)
    g.fillText('TYPE', 175, TOP + 23)
    g.fillText('QUANTITY', 340, TOP + 23)
    g.fillText('RATE', 450, TOP + 23)
    g.textAlign = 'right'
    g.fillText('AMOUNT', 746, TOP + 23)

    // Rows
    lines.forEach((r, i) => {
        const y = START + i * ROW
        const base = y + 35
        g.textAlign = 'left'
        g.fillStyle = INK
        g.font = font(600, 16)
        g.fillText(r.item, 54, base)
        g.font = font(400, 15)
        g.fillText(fit(g, r.type, 155), 175, base)
        g.fillText(r.qty, 340, base)
        g.fillText(fit(g, r.rate, 190), 450, base)
        g.textAlign = 'right'
        g.font = font(600, 16)
        g.fillText(r.amount, 746, base)
        g.fillStyle = RULE
        g.fillRect(40, y + ROW - 1, 720, 1)
    })

    // Total box
    g.fillStyle = '#f1f5f9'
    g.beginPath()
    g.roundRect(440, totalY, 320, 70, 14)
    g.fill()
    g.textAlign = 'left'
    g.fillStyle = '#475569'
    g.font = font(600, 16)
    g.fillText('Total', 462, totalY + 42)
    g.textAlign = 'right'
    g.fillStyle = NAVY
    g.font = font(700, 30)
    g.fillText(rs(total), 738, totalY + 46)

    // Footer
    g.textAlign = 'center'
    g.fillStyle = '#94a3b8'
    g.font = font(400, 13)
    g.fillText('Thank you for your business', W / 2, footY)

    return canvas
}
function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
    return new Promise((resolve, reject) =>
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not make image'))), 'image/png'),
    )
}

async function makePdfBlob(lines: BillLine[], total: number, client: string, at: number): Promise<Blob> {
    const canvas = drawBill(lines, total, client, at)
    const { jsPDF } = await import('jspdf')
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
    const margin = 10
    const width = 210 - margin * 2
    const height = (width * canvas.height) / canvas.width
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', margin, margin, width, height)
    return pdf.output('blob')
}

function download(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    URL.revokeObjectURL(url)
}

export function BillShareDialog({ open, onOpenChange, lines, total, client, at, onPrint }: BillShareDialogProps) {
    const navigate = useNavigate()
    const [busy, setBusy] = useState<null | 'save' | 'sharePdf' | 'shareImage'>(null)
    const [fileSent, setFileSent] = useState(false)

    // Account details are added and locked in Settings. Here they are only read.
    const { account } = useAccount()
    const hasAccount = account.number !== ''

    // Start fresh every time the popup is closed.
    useEffect(() => {
        if (!open) setFileSent(false)
    }, [open])

    const baseName =
        safeFileName(client) ||
        `Bill ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`

    function goToSettings() {
        onOpenChange(false)
        navigate('/settings') // use your real Settings route if it differs
    }

    // Bank, title and number only (no bill total). The number is alone on the last line.
    function accountDetailsOnly() {
        const parts: string[] = []
        if (account.bank) parts.push(`Bank: ${account.bank}`)
        if (account.title) parts.push(`Account title: ${account.title}`)
        parts.push('Account number:', account.number)
        return parts.join('\n')
    }

    // Bill total plus the account details.
    function accountMessage() {
        return `Bill total: ${rs(total)}\n\n${accountDetailsOnly()}`
    }

    // Makes the file, then shares it (phone share sheet, so WhatsApp etc.).
    // Where files can't be shared (most laptops) it downloads instead.
    async function shareFile(kind: 'pdf' | 'image') {
        if (busy) return
        setBusy(kind === 'pdf' ? 'sharePdf' : 'shareImage')
        try {
            await loadShopFonts()
            const blob =
                kind === 'pdf'
                    ? await makePdfBlob(lines, total, client, at ?? Date.now())
                    : await canvasToBlob(drawBill(lines, total, client, at ?? Date.now()))
            const name = `${baseName}.${kind === 'pdf' ? 'pdf' : 'png'}`
            const mime = kind === 'pdf' ? 'application/pdf' : 'image/png'
            const file = new File([blob], name, { type: mime })
            if (navigator.canShare?.({ files: [file] })) {
                await navigator.share(
                    hasAccount
                        ? { files: [file], text: accountMessage() }
                        : { files: [file] },
                )
            } else {
                download(blob, name)
                toast('Sharing is not available here. File saved.')
            }
            setFileSent(true) // popup stays open so the account message can be sent as the next step
        } catch (err) {
            // Closing the share sheet without choosing anyone is not a failure.
            if (!(err instanceof DOMException && err.name === 'AbortError')) {
                console.error(err)
                toast.error('Could not share. Try Save as PDF instead.')
            }
        } finally {
            setBusy(null)
        }
    }

    async function saveAsPdf() {
        if (busy) return
        setBusy('save')
        try {
            await loadShopFonts()
            download(await makePdfBlob(lines, total, client, at ?? Date.now()), `${baseName}.pdf`)
            toast.success('PDF saved.')
            onOpenChange(false)
        } catch (err) {
            console.error(err)
            toast.error('Could not make the PDF. Try Print instead.')
        } finally {
            setBusy(null)
        }
    }

    function handlePrint() {
        onOpenChange(false)
        setTimeout(onPrint, 250) // let the popup close so it is not on the printed page
    }

    async function shareText(text: string) {
        try {
            if (navigator.share) {
                await navigator.share({ text })
            } else {
                // Laptops: open WhatsApp with the message typed in.
                window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
            }
        } catch (err) {
            if (!(err instanceof DOMException && err.name === 'AbortError')) {
                console.error(err)
                toast.error('Could not share the account details.')
            }
        }
    }

    function shareAccount() {
        if (!hasAccount) return goToSettings()
        return shareText(accountMessage())
    }

    // Sends bank name, account title and number (no bill total).
    function shareAccountDetailsOnly() {
        if (!hasAccount) return goToSettings()
        return shareText(accountDetailsOnly())
    }

    async function copyAccount() {
        if (!hasAccount) return goToSettings()
        try {
            await navigator.clipboard.writeText(account.number)
            toast.success('Account number copied.')
        } catch {
            toast.error('Could not copy. Please copy it by hand.')
        }
    }

    return (
        <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
            <DialogPrimitive.Portal>
                <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40" />
                <DialogPrimitive.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[92vh] overflow-y-auto rounded-t-2xl border-hair border-border bg-background p-5 pb-[calc(env(safe-area-inset-bottom)+20px)] text-foreground focus-visible:outline-none sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[calc(100%-32px)] sm:max-w-[400px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:pb-5">
                    <div className="mb-3 flex items-center justify-between">
                        <DialogPrimitive.Title className="text-[18px] font-semibold">
                            Print, save or share
                        </DialogPrimitive.Title>
                        <DialogPrimitive.Close asChild>
                            <button
                                type="button"
                                aria-label="Close"
                                className="flex h-9 w-9 flex-none items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
                            >
                                <IconX size={18} />
                            </button>
                        </DialogPrimitive.Close>
                    </div>

                    <Button size="lg" className="mb-2.5 w-full" disabled={!!busy} onClick={saveAsPdf}>
                        {busy === 'save' && <IconLoader2 size={18} className="animate-spin" />}
                        Save as PDF
                    </Button>
                    <Button variant="outline" size="lg" className="mb-2.5 w-full" disabled={!!busy} onClick={handlePrint}>
                        Print
                    </Button>
                    <Button
                        variant="outline"
                        size="lg"
                        className="mb-2.5 w-full"
                        disabled={!!busy}
                        onClick={() => shareFile('pdf')}
                    >
                        {busy === 'sharePdf' ? <IconLoader2 size={18} className="animate-spin" /> : <IconShare2 size={18} />}
                        Share PDF
                    </Button>
                    <Button
                        variant="outline"
                        size="lg"
                        className="mb-2.5 w-full"
                        disabled={!!busy}
                        onClick={() => shareFile('image')}
                    >
                        {busy === 'shareImage' ? <IconLoader2 size={18} className="animate-spin" /> : <IconPhoto size={18} />}
                        Share as image
                    </Button>

                    {/* Account details (added and locked in Settings) */}
                    <div
                        className={`mb-3 mt-4 rounded-2xl border p-3.5 ${fileSent && hasAccount ? 'border-[#c2410c]' : 'border-border'}`}
                    >
                        {!hasAccount ? (
                            <div>
                                <p className="mb-2 text-[13px] text-muted-foreground">
                                    Add your account details in Settings to send them to clients along with the bill.
                                </p>
                                <Button variant="outline" className="h-11 w-full" onClick={goToSettings}>
                                    Go to Settings
                                </Button>
                            </div>
                        ) : (
                            <>
                                <p className="mb-0.5 text-[13px] text-muted-foreground">
                                    {fileSent ? 'Bill shared. Now send the account number as a message' : 'Account number'}
                                </p>
                                {account.bank && <p className="mb-0 text-[13px] text-muted-foreground">{account.bank}</p>}
                                {account.title && <p className="mb-0 text-[15px] font-semibold">{account.title}</p>}
                                <p className="mb-3 select-all text-[17px] font-semibold tracking-wide">{account.number}</p>
                                <div className="flex gap-2.5">
                                    <Button variant="outline" className="h-11 flex-1" onClick={shareAccount}>
                                        <IconBrandWhatsapp size={18} />
                                        Send details
                                    </Button>
                                    <Button variant="outline" className="h-11 flex-1" onClick={copyAccount}>
                                        <IconCopy size={18} />
                                        Copy
                                    </Button>
                                </div>
                                <Button variant="outline" className="mt-2.5 h-11 w-full" onClick={shareAccountDetailsOnly}>
                                    <IconBrandWhatsapp size={18} />
                                    Send bank details (without total)
                                </Button>
                            </>
                        )}
                    </div>

                    <button
                        type="button"
                        onClick={() => onOpenChange(false)}
                        className="block w-full text-center text-[14px] text-accent-text"
                    >
                        Done
                    </button>
                </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
    )
}