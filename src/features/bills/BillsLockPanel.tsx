import { useEffect, useState } from 'react'
import { IconEye, IconLoader2, IconLock } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { verifyPassword } from '@/lib/account'
import { useAuth } from '@/store/auth'
import { lockBills, secondsLeft, unlockBills } from './billsLock'

/** Small popup that asks for the login password and then shows the amounts. */
export function UnlockDialog({
    open,
    onOpenChange,
    purpose = 'to show the amounts',
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    purpose?: string
}) {
    const email = useAuth((s) => s.email)
    const [password, setPassword] = useState('')
    const [checking, setChecking] = useState(false)
    const [error, setError] = useState('')

    // Start clean every time the popup opens.
    useEffect(() => {
        if (open) {
            setPassword('')
            setError('')
        }
    }, [open])

    async function unlock() {
        if (!password || checking) return
        setChecking(true)
        setError('')
        try {
            const ok = await verifyPassword(email ?? '', password)
            if (!ok) {
                setError('Wrong password. Try again.')
                return
            }
            setPassword('')
            unlockBills()
            onOpenChange(false)
        } catch (err) {
            console.error(err)
            const code = (err as { code?: string })?.code ?? ''
            setError(
                code === 'auth/too-many-requests'
                    ? 'Too many tries. Wait a few minutes and try again.'
                    : code === 'auth/network-request-failed'
                        ? 'No internet. Connect and try again.'
                        : 'Could not check the password. Try again.',
            )
        } finally {
            setChecking(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={(o) => !checking && onOpenChange(o)}>
            <DialogContent>
                <DialogTitle>Enter your password</DialogTitle>
                <DialogDescription>
                    Type the password you use to log in{email ? ` as ${email}` : ''} {purpose}.
                </DialogDescription>
                <Input
                    type="password"
                    autoComplete="current-password"
                    autoFocus
                    className="mt-3 border border-border-stronger bg-transparent px-3 text-[16px]"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && unlock()}
                />
                {error && <p className="mb-0 mt-1.5 text-[12.5px] text-danger-text">{error}</p>}
                <div className="mt-4 flex gap-2.5">
                    <Button size="lg" variant="outline" className="flex-1" disabled={checking} onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button size="lg" className="flex-1" disabled={!password || checking} onClick={unlock}>
                        {checking && <IconLoader2 size={18} className="animate-spin" />}
                        Unlock
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}

/**
 * Bar at the top of the Bills pages.
 * Locked: a "Show amounts" button that opens the password popup.
 * Unlocked: the time left and a "Lock now" button.
 */
export function LockBar({ unlocked }: { unlocked: boolean }) {
    const [left, setLeft] = useState(secondsLeft)
    const [askOpen, setAskOpen] = useState(false)

    useEffect(() => {
        if (!unlocked) return
        setLeft(secondsLeft())
        const t = setInterval(() => setLeft(secondsLeft()), 1000)
        return () => clearInterval(t)
    }, [unlocked])

    const mm = Math.floor(left / 60)
    const ss = String(left % 60).padStart(2, '0')
    const btn = 'flex h-9 items-center gap-1.5 rounded-lg border border-border-strong px-3 text-[13px] hover:bg-muted'

    return (
        <div className="mb-3 flex items-center justify-between">
            {unlocked ? (
                <>
                    <p className="mb-0 text-[12.5px] text-muted-foreground">
                        Amounts hide in {mm}:{ss}
                    </p>
                    <button type="button" onClick={lockBills} className={btn}>
                        <IconLock size={15} />
                        Lock now
                    </button>
                </>
            ) : (
                <>
                    <p className="mb-0 text-[12.5px] text-muted-foreground">Amounts are hidden</p>
                    <button type="button" onClick={() => setAskOpen(true)} className={btn}>
                        <IconEye size={15} />
                        Show amounts
                    </button>
                </>
            )}
            <UnlockDialog open={askOpen} onOpenChange={setAskOpen} />
        </div>
    )
}