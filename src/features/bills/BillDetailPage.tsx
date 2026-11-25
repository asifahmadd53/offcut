import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { IconLock } from '@tabler/icons-react'
import { toast } from 'sonner'
import { AppShell } from '@/components/AppShell'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { StatusTag } from './StatusTag'
import { dateTimeText, statusOf, type SavedBill } from './types'
import { hideBill, setBillStatus, watchBill } from './billsStore'
import { rs } from '@/lib/bill'
import { useBillsLock } from './billsLock'
import { UnlockDialog } from './BillsLockPanel'

type Action = 'paid' | 'unpaid' | 'remove'

// Empty values are saved as a dash, so a dash means there is nothing to show.
const hasValue = (v: unknown) => v !== undefined && v !== null && v !== '' && v !== '—'

export default function BillDetailPage() {
    // A paid bill is locked until the owner enters the password (the same unlock as Show amounts).
    const unlocked = useBillsLock()
    const [askOpen, setAskOpen] = useState(false)
    const { id } = useParams()
    const navigate = useNavigate()
    const [bill, setBill] = useState<SavedBill | null>(null)
    const [loaded, setLoaded] = useState(false)
    const [error, setError] = useState('')
    const [confirm, setConfirm] = useState<Action | null>(null)
    const [busy, setBusy] = useState(false)

    useEffect(() => {
        if (!id) return
        return watchBill(
            id,
            (b) => {
                setBill(b)
                setLoaded(true)
                setError('')
            },
            (err) => {
                console.error(err)
                setError('Could not load this bill. Check your internet and try again.')
            },
        )
    }, [id])

    async function apply() {
        if (!bill || !confirm || busy) return
        const action = confirm
        setBusy(true)
        try {
            if (action === 'remove') {
                await hideBill(bill.id)
                toast.success('Bill removed.')
                setConfirm(null)
                navigate('/bills', { replace: true })
                return
            }
            await setBillStatus(bill.id, action)
            toast.success(action === 'paid' ? 'Marked as paid.' : 'Marked as unpaid.')
            setConfirm(null)
        } catch (err) {
            console.error(err)
            toast.error("Couldn't update the bill. Try again.")
        } finally {
            setBusy(false)
        }
    }

    if (!loaded || !bill || bill.hidden) {
        return (
            <AppShell title="Bill" back="/bills" parentTab="bills">
                <p className="mt-8 text-center text-[15px] text-muted-foreground">
                    {error || (loaded ? 'This bill could not be found.' : 'Loading…')}
                </p>
            </AppShell>
        )
    }

    const status = statusOf(bill)

    const dialogText: Record<Action, { title: string; body: string; button: string }> = {
        paid: {
            title: 'Mark as paid?',
            body: `${bill.client || 'This bill'} · ${rs(bill.total)} will count as received. Only the owner can change it later.`,
            button: 'Mark as paid',
        },
        unpaid: {
            title: 'Mark as unpaid?',
            body: `${bill.client || 'This bill'} · ${rs(bill.total)} will count as unpaid again.`,
            button: 'Mark as unpaid',
        },
        remove: {
            title: 'Remove this bill?',
            body: 'It will be hidden from your bills and totals.',
            button: 'Remove',
        },
    }
    const d = confirm ? dialogText[confirm] : null

    return (
        <AppShell
            title="Bill"
            back="/bills"
            parentTab="bills"
            stickyBar={
                status === 'unpaid' ? (
                    <Button size="lg" className="w-full" onClick={() => setConfirm('paid')}>
                        Mark as paid
                    </Button>
                ) : unlocked ? (
                    <Button size="lg" variant="outline" className="w-full" onClick={() => setConfirm('unpaid')}>
                        Mark as unpaid
                    </Button>
                ) : undefined
            }
        >
            <div className="rounded-lg border border-border p-4">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <p className="mb-0 break-words text-[18px] font-semibold">{bill.client || 'No name'}</p>
                        <p className="mb-0 text-[13px] text-muted-foreground">{dateTimeText(bill.createdAt)}</p>
                    </div>
                    <StatusTag status={status} />
                </div>
                {status === 'paid' && bill.paidAt && (
                    <p className="mb-0 mt-1 text-[13px] text-muted-foreground">Paid on {dateTimeText(bill.paidAt)}</p>
                )}

                <div className="mt-4 border-t border-border pt-3 text-[13px]">
                    {bill.lines.map((l, i) => (
                        <div key={i} className="mb-2.5 flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <p className="mb-0 font-medium">
                                    {l.item}
                                    {l.type && l.type !== '—' ? ` · ${l.type}` : ''}
                                </p>
                                {hasValue(l.qty) && hasValue(l.rate) && (
                                    <p className="mb-0 text-muted-foreground">
                                        {l.qty} × {l.rate}
                                    </p>
                                )}
                            </div>
                            <span className="flex-none font-medium">{l.amount}</span>
                        </div>
                    ))}
                </div>

                <div className="mt-3 border-t border-border pt-3 text-[13px]">
                    <div className="flex justify-between">
                        <span className="text-muted-foreground">Edge tape</span>
                        <span>{rs(bill.tapeTotal)}</span>
                    </div>
                    <div className="mt-1 flex justify-between">
                        <span className="text-muted-foreground">Cutting</span>
                        <span>{rs(bill.cutting)}</span>
                    </div>
                    {(bill.fare ?? 0) > 0 && (
                        <div className="mt-1 flex justify-between">
                            <span className="text-muted-foreground">Rickshaw fare</span>
                            <span>{rs(bill.fare ?? 0)}</span>
                        </div>
                    )}
                    <div className="mt-3 flex items-baseline justify-between">
                        <span className="text-[14px] font-semibold">Total</span>
                        <span className="text-[24px] font-semibold text-[#c2410c] dark:text-primary">{rs(bill.total)}</span>
                    </div>
                </div>
            </div>

            {status === 'unpaid' || unlocked ? (
                <>
                    <Button variant="outline" size="lg" className="mt-4 w-full text-danger-text" onClick={() => setConfirm('remove')}>
                        Remove bill
                    </Button>
                    <p className="mb-0 mt-1.5 text-center text-[12px] text-faint">
                        Removed bills are hidden from the list and the totals.
                    </p>
                </>
            ) : (
                <button
                    type="button"
                    onClick={() => setAskOpen(true)}
                    className="mx-auto mt-4 flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"
                >
                    <IconLock size={15} />
                    This bill is locked. Unlock with password
                </button>
            )}

            <Dialog open={!!confirm} onOpenChange={(o) => !o && !busy && setConfirm(null)}>
                <DialogContent>
                    <DialogTitle>{d?.title}</DialogTitle>
                    <DialogDescription>{d?.body}</DialogDescription>
                    <div className="mt-4 flex gap-2.5">
                        <Button size="lg" variant="outline" className="flex-1" disabled={busy} onClick={() => setConfirm(null)}>
                            Cancel
                        </Button>
                        <Button size="lg" className="flex-1" disabled={busy} onClick={apply}>
                            {d?.button}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            <UnlockDialog open={askOpen} onOpenChange={setAskOpen} purpose="to change this paid bill" />
        </AppShell>
    )
}