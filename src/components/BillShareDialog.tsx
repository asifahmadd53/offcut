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
    /** Opens the browser print window (the page's existing print function). */
    onPrint: () => void
}

function safeFileName(name: string): string {
    return name.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim()
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
function drawBill(lines: BillLine[], total: number, client: string): HTMLCanvasElement {
    const ROW = 64
    const rowsEnd = 230 + lines.length * ROW
    const totalY = rowsEnd + 24
    const footerY = totalY + 68 + 70

    const W = 800
    const H = footerY + 50
    const S = 2 // 2x for sharp text
    const canvas = document.createElement('canvas')
    canvas.width = W * S
    canvas.height = H * S
    const g = canvas.getContext('2d')!
    g.scale(S, S)

    const font = (weight: number, size: number) => `${weight} ${size}px Poppins, system-ui, sans-serif`
    const now = new Date()
    const today = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    const time = now.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true })

    g.fillStyle = '#ffffff'
    g.fillRect(0, 0, W, H)
    g.textBaseline = 'alphabetic'

    // Header
    g.fillStyle = '#c2410c'
    g.font = font(700, 15)
    g.fillText('OFFCUT  ·  BILL', 40, 56)

    g.fillStyle = '#111111'
    g.font = font(700, 30)
    g.fillText(fit(g, `Client name: ${client || '____________'}`, 720), 40, 108)

    g.fillStyle = '#666666'
    g.font = font(400, 15)
    g.fillText(`${today} · ${time}`, 40, 140)

    g.fillStyle = '#c2410c'
    g.fillRect(40, 160, 720, 2)

    // Table header
    g.fillStyle = '#f4f1ec'
    g.fillRect(40, 190, 720, 40)
    g.fillStyle = '#6b6b6b'
    g.font = font(600, 12)
    g.textAlign = 'left'
    g.fillText('ITEM', 52, 215)
    g.fillText('TYPE', 170, 215)
    g.fillText('QUANTITY', 335, 215)
    g.fillText('RATE', 450, 215)
    g.textAlign = 'right'
    g.fillText('AMOUNT', 748, 215)

    // Table rows
    lines.forEach((r, i) => {
        const y = 230 + i * ROW
        const base = y + 38
        g.textAlign = 'left'
        g.fillStyle = '#1a1a1a'
        g.font = font(600, 16)
        g.fillText(r.item, 52, base)
        g.font = font(400, 16)
        g.fillText(fit(g, r.type, 155), 170, base)
        g.fillText(r.qty, 335, base)
        g.fillText(fit(g, r.rate, 190), 450, base)
        g.textAlign = 'right'
        g.font = font(600, 16)
        g.fillText(r.amount, 748, base)
        g.fillStyle = '#e3e0da'
        g.fillRect(40, y + ROW - 1, 720, 1)
    })

    // Total box
    g.fillStyle = '#f4f1ec'
    g.beginPath()
    g.roundRect(440, totalY, 320, 68, 14)
    g.fill()
    g.textAlign = 'left'
    g.fillStyle = '#444444'
    g.font = font(600, 16)
    g.fillText('Total', 462, totalY + 42)
    g.textAlign = 'right'
    g.fillStyle = '#111111'
    g.font = font(700, 30)
    g.fillText(rs(total), 738, totalY + 46)

    // Footer
    g.textAlign = 'center'
    g.fillStyle = '#8a8a8a'
    g.font = font(400, 14)
    g.fillText('Thank you for your business', W / 2, footerY)

    return canvas
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
    return new Promise((resolve, reject) =>
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not make image'))), 'image/png'),
    )
}

async function makePdfBlob(lines: BillLine[], total: number, client: string): Promise<Blob> {
    const canvas = drawBill(lines, total, client)
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

export function BillShareDialog({ open, onOpenChange, lines, total, client, onPrint }: BillShareDialogProps) {
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

    const baseName = safeFileName(client) || 'Bill'

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
            const blob =
                kind === 'pdf'
                    ? await makePdfBlob(lines, total, client)
                    : await canvasToBlob(drawBill(lines, total, client))
            const name = `${baseName}.${kind === 'pdf' ? 'pdf' : 'png'}`
            const file = new File([blob], name, { type: blob.type })
            if (navigator.canShare?.({ files: [file] })) {
                await navigator.share(
                    hasAccount ? { files: [file], title: name, text: accountMessage() } : { files: [file], title: name },
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
            download(await makePdfBlob(lines, total, client), `${baseName}.pdf`)
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