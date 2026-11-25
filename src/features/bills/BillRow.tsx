import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { IconArrowBackUp, IconCheck, IconDotsVertical, IconLock, IconTrash } from '@tabler/icons-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { rs } from '@/lib/bill'
import { StatusTag } from './StatusTag'
import { dateTimeText, statusOf, type SavedBill } from './types'
import { hideBill, setBillStatus } from './billsStore'
import { UnlockDialog } from './BillsLockPanel'

type Action = 'paid' | 'unpaid' | 'remove'

export function BillRow({ bill, unlocked }: { bill: SavedBill; unlocked: boolean }) {
    const [open, setOpen] = useState(false)
    const [confirm, setConfirm] = useState<Action | null>(null)
    const [askOpen, setAskOpen] = useState(false)
    const status = statusOf(bill)
    // A paid bill is locked until the owner enters the password.
    const locked = status === 'paid' && !unlocked

    // Escape closes the menu.
    useEffect(() => {
        if (!open) return
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [open])

    const who = bill.client || 'This bill'
    const dialogText: Record<Action, { title: string; body: string; button: string }> = {
        paid: {
            title: 'Mark as paid?',
            body: `${who} · ${rs(bill.total)} will count as received. Only the owner can change it later.`,
            button: 'Mark as paid',
        },
        unpaid: {
            title: 'Mark as unpaid?',
            body: `${who} · ${rs(bill.total)} will count as unpaid again.`,
            button: 'Mark as unpaid',
        },
        remove: {
            title: 'Remove this bill?',
            body: `${who} · ${rs(bill.total)} will be hidden from your bills and totals.`,
            button: 'Remove',
        },
    }
    const d = confirm ? dialogText[confirm] : null

    function ask(act: Action) {
        setOpen(false)
        setConfirm(act)
    }

    async function apply() {
        if (!confirm) return
        const act = confirm
        setConfirm(null) // close the popup at once
        try {
            if (act === 'remove') {
                await hideBill(bill.id)
                toast.success('Bill removed.')
                return
            }
            await setBillStatus(bill.id, act)
            toast.success(act === 'paid' ? 'Marked as paid.' : 'Marked as unpaid.')
        } catch (err) {
            console.error(err)
            toast.error("Couldn't update the bill. Try again.")
        }
    }

    const item =
        'flex h-10 w-full items-center gap-3 rounded-md px-3 text-left text-[14.5px] outline-none transition-colors hover:bg-muted focus-visible:bg-muted'

    return (
        <div className="relative mb-2 flex items-stretch rounded-lg border border-border transition-colors hover:bg-muted">
            {/* Tapping the row opens the bill. */}
            <Link to={`/bills/${bill.id}`} className="flex min-w-0 flex-1 items-center justify-between gap-3 py-3 pl-3.5 pr-2">
                <div className="min-w-0">
                    <p className="mb-0 truncate text-[15px] font-semibold">{bill.client || 'No name'}</p>
                    <p className="mb-0 text-[12px] text-muted-foreground">{dateTimeText(bill.createdAt)}</p>
                    {bill.pending && (
                        <p className="mb-0 text-[11.5px] text-amber-700 dark:text-amber-400">Waiting to upload</p>
                    )}
                </div>
                <div className="flex-none text-right">
                    <p className="mb-1 text-[15px] font-semibold">{rs(bill.total)}</p>
                    <StatusTag status={status} />
                </div>
            </Link>

            {/* The menu button sits next to the link, not inside it, so it never opens the bill. */}
            <div className="relative flex flex-none items-center pr-1.5">
                <button
                    type="button"
                    aria-label="Bill actions"
                    aria-haspopup="menu"
                    aria-expanded={open}
                    onClick={() => setOpen((o) => !o)}
                    className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-black/[0.06] hover:text-foreground focus-visible:bg-black/[0.08] dark:hover:bg-white/[0.08] dark:focus-visible:bg-white/[0.1]"
                >
                    <IconDotsVertical size={18} />
                </button>

                {open && (
                    <>
                        {/* Tap anywhere outside to close. */}
                        <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setOpen(false)} />
                        <div
                            role="menu"
                            className="absolute right-1.5 top-full z-50 mt-1 w-[190px] rounded-lg border border-border-strong bg-card p-1 shadow-2xl shadow-black/70"
                        >
                            {locked ? (
                                <button
                                    type="button"
                                    role="menuitem"
                                    className={item}
                                    onClick={() => {
                                        setOpen(false)
                                        setAskOpen(true)
                                    }}
                                >
                                    <IconLock size={18} className="flex-none text-muted-foreground" />
                                    Unlock to change
                                </button>
                            ) : (
                                <>
                                    {status === 'unpaid' ? (
                                        <button type="button" role="menuitem" className={item} onClick={() => ask('paid')}>
                                            <IconCheck size={18} className="flex-none text-green-600 dark:text-green-400" />
                                            Mark as paid
                                        </button>
                                    ) : (
                                        <button type="button" role="menuitem" className={item} onClick={() => ask('unpaid')}>
                                            <IconArrowBackUp size={18} className="flex-none text-amber-600 dark:text-amber-400" />
                                            Mark as unpaid
                                        </button>
                                    )}
                                    <div className="mx-1 my-1 h-px bg-border" />
                                    <button
                                        type="button"
                                        role="menuitem"
                                        className={`${item} text-danger-text`}
                                        onClick={() => ask('remove')}
                                    >
                                        <IconTrash size={18} className="flex-none" />
                                        Remove bill
                                    </button>
                                </>
                            )}
                        </div>
                    </>
                )}
            </div>

            <Dialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
                <DialogContent>
                    <DialogTitle>{d?.title}</DialogTitle>
                    <DialogDescription>{d?.body}</DialogDescription>
                    <div className="mt-4 flex gap-2.5">
                        <Button size="lg" variant="outline" className="flex-1" onClick={() => setConfirm(null)}>
                            Cancel
                        </Button>
                        <Button size="lg" className="flex-1" onClick={apply}>
                            {d?.button}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            <UnlockDialog open={askOpen} onOpenChange={setAskOpen} purpose="to change this paid bill" />
        </div>
    )
}