import { useState, useEffect } from 'react'
import { IconLock, IconLockOpen, IconLoader2 } from '@tabler/icons-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/store/auth'
import { useAccount, verifyPassword, type Account } from '@/lib/account'

export function AccountSection() {
    const email = useAuth((s) => s.email)
    const { account, save } = useAccount()
    const hasAccount = account.number !== ''

    const [editing, setEditing] = useState(false)
    const [form, setForm] = useState<Account>(account)
    const [askOpen, setAskOpen] = useState(false)
    const [password, setPassword] = useState('')
    const [checking, setChecking] = useState(false)
    const [error, setError] = useState('')

    // First time (nothing saved yet) the form is open without a password.
    const showForm = editing || !hasAccount

    function closeAsk() {
        setAskOpen(false)
        setPassword('')
        setError('')
    }

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
            closeAsk()
            setForm(account)
            setEditing(true)
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
    useEffect(() => {
        if (!editing) setForm(account)
    }, [account, editing])

    function saveForm() {
        if (!form.number.trim()) {
            toast.error('Please enter the account number.')
            return
        }
        save(form)
        setEditing(false)
        toast.success('Account details saved and locked.')
    }

    return (
        <div className="border-b border-border py-3">
            <Label>Account details (shared with clients)</Label>

            {showForm ? (
                <div className="flex flex-col gap-2.5">
                    <div>
                        <Label htmlFor="acc-bank" className="mb-1 text-[12.5px] font-normal text-muted-foreground">
                            Bank name
                        </Label>
                        <Input
                            id="acc-bank"
                            autoComplete="off"
                            className="border border-border-stronger bg-transparent px-3 text-[18px]"
                            value={form.bank}
                            onChange={(e) => setForm({ ...form, bank: e.target.value })}
                        />
                    </div>
                    <div>
                        <Label htmlFor="acc-title" className="mb-1 text-[12.5px] font-normal text-muted-foreground">
                            Account title (name)
                        </Label>
                        <Input
                            id="acc-title"
                            autoComplete="off"
                            className="border border-border-stronger bg-transparent px-3 text-[18px]"
                            value={form.title}
                            onChange={(e) => setForm({ ...form, title: e.target.value })}
                        />
                    </div>
                    <div>
                        <Label htmlFor="acc-number" className="mb-1 text-[12.5px] font-normal text-muted-foreground">
                            Account number
                        </Label>
                        <Input
                            id="acc-number"
                            autoComplete="off"
                            className="border border-border-stronger bg-transparent px-3 text-[18px]"
                            value={form.number}
                            onChange={(e) => setForm({ ...form, number: e.target.value })}
                        />
                    </div>
                    <div className="flex gap-2.5">
                        {hasAccount && (
                            <Button variant="outline" size="lg" className="flex-1" onClick={() => setEditing(false)}>
                                Cancel
                            </Button>
                        )}
                        <Button size="lg" className="flex-1" onClick={saveForm}>
                            Save account details
                        </Button>
                    </div>
                    {!hasAccount && (
                        <p className="mb-0 text-[12.5px] text-faint">
                            After saving, these details are locked. Changing them later needs your login password.
                        </p>
                    )}
                </div>
            ) : (
                <div className="rounded-lg border border-border p-3">
                    <div className="mb-2 flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
                        <IconLock size={15} />
                        Locked
                    </div>
                    {account.bank && <p className="mb-0.5 text-[14px] text-muted-foreground">{account.bank}</p>}
                    {account.title && <p className="mb-0.5 text-[15px] font-semibold">{account.title}</p>}
                    <p className="mb-3 text-[17px] font-semibold tracking-wide">{account.number}</p>
                    <Button variant="outline" size="lg" className="w-full" onClick={() => setAskOpen(true)}>
                        <IconLockOpen size={18} />
                        Edit account details
                    </Button>
                </div>
            )}

            <Dialog open={askOpen} onOpenChange={(o) => !o && closeAsk()}>
                <DialogContent>
                    <DialogTitle>Enter your password</DialogTitle>
                    <DialogDescription>
                        Type the password you use to log in{email ? ` as ${email}` : ''} to edit your account details.
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
                        <Button size="lg" variant="outline" className="flex-1" onClick={closeAsk}>
                            Cancel
                        </Button>
                        <Button size="lg" className="flex-1" disabled={!password || checking} onClick={unlock}>
                            {checking && <IconLoader2 size={18} className="animate-spin" />}
                            Unlock
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}