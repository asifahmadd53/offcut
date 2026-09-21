import { useState } from 'react'
import { IconScissors, IconWifiOff, IconLoader2 } from '@tabler/icons-react'
import {
  BAD_EMAIL_MESSAGE,
  EMAIL_MISMATCH_MESSAGE,
  friendlyAuthError,
  isValidEmail,
  useAuth,
} from '@/store/auth'
import { useToast } from '@/store/toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Mode = 'login' | 'register'

export default function Login() {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [confirmEmail, setConfirmEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const login = useAuth((s) => s.login)
  const register = useAuth((s) => s.register)
  const resetPassword = useAuth((s) => s.resetPassword)
  const toast = useToast((s) => s.show)

  const canSubmit = email.trim().length > 0 && password.length > 0 && !busy

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!isValidEmail(email)) {
      setError(BAD_EMAIL_MESSAGE)
      return
    }
    if (mode === 'register') {
      if (!isValidEmail(confirmEmail)) {
        setError(BAD_EMAIL_MESSAGE)
        return
      }
      if (email.trim().toLowerCase() !== confirmEmail.trim().toLowerCase()) {
        setError(EMAIL_MISMATCH_MESSAGE)
        return
      }
      if (password.length < 6) {
        setError('Use a password with at least 6 characters.')
        return
      }
    }

    setBusy(true)
    try {
      if (mode === 'login') await login(email, password)
      else await register(email, password)
    } catch (err) {
      setError(friendlyAuthError(err))
    } finally {
      setBusy(false)
    }
  }

  async function onForgotPassword() {
    setError(null)
    if (!email.trim()) {
      setError('Type your email above first, then tap Forgot password.')
      return
    }
    if (!isValidEmail(email)) {
      setError(BAD_EMAIL_MESSAGE)
      return
    }
    try {
      await resetPassword(email)
      toast('Password reset email sent.')
    } catch (err) {
      setError(friendlyAuthError(err))
    }
  }

  function switchMode(next: Mode) {
    setMode(next)
    setError(null)
    setConfirmEmail('')
  }

  return (
    <div className="flex min-h-dvh w-full items-center justify-center bg-background px-0 py-0 sm:px-6 sm:py-10">
      <div className="page-enter flex w-full max-w-[420px] flex-col justify-center rounded-none bg-transparent px-5 py-10 sm:rounded-card sm:border-hair sm:border-border sm:bg-card sm:px-8 sm:py-10 sm:shadow-elevated">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-[14px] bg-brand text-brand-fg">
            <IconScissors size={26} />
          </div>
          <p className="mb-1 text-[15px] font-semibold tracking-wide text-brand-ink">Offcut</p>
          {mode === 'login' ? (
            <>
              <p className="text-[24px] font-semibold">Welcome back</p>
              <p className="text-[14px] text-muted-foreground">Plan cuts. Reuse every leftover.</p>
            </>
          ) : (
            <>
              <p className="text-[24px] font-semibold">Create your shop account</p>
              <p className="text-[14px] text-muted-foreground">One account for all your phones.</p>
            </>
          )}
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <div>
          <Label htmlFor="email">Shop email</Label>
          <Input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="off"
              className="border border-border bg-transparent"
            placeholder="name@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        {mode === 'register' && (
          <div>
            <Label htmlFor="confirm-email">Confirm shop email</Label>
            <Input
              id="confirm-email"
              type="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="off"
                className="border border-border bg-transparent"
              placeholder="name@company.com"
              value={confirmEmail}
              onChange={(e) => setConfirmEmail(e.target.value)}
            />
          </div>
        )}

        <div>
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            placeholder="Your password"
            className="border border-border bg-transparent"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <p className="mt-1.5 text-[13px] text-danger-text">{error}</p>}
        </div>

          <Button
            type="submit"
            size="lg"
            className={busy ? 'mt-1 disabled:opacity-100' : 'mt-1'}
            disabled={!canSubmit || busy}
            aria-busy={busy}
          >
            {busy ? (
              <>
                <IconLoader2
                  className="size-5 animate-spin motion-reduce:animate-pulse"
                  aria-hidden="true"
                />
                <span className="sr-only" role="status">
                  {mode === 'login' ? 'Logging in' : 'Creating account'}
                </span>
              </>
            ) : mode === 'login' ? (
              'Log in'
            ) : (
              'Create account'
            )}
          </Button>

        {mode === 'login' && (
          <button
            type="button"
            onClick={onForgotPassword}
            className="text-center hover:underline text-[13px] text-accent-text"
          >
            Forgot password
          </button>
        )}

        <button
          type="button"
          onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}
          className="text-center text-[14px] hover:underline text-accent-text"
        >
          {mode === 'login' ? 'Create shop account' : 'I already have an account'}
        </button>
      </form>

        <div className="mt-6 flex items-center justify-center gap-1.5 text-[12px] text-faint">
          <IconWifiOff size={14} />
          Works offline after your first login
        </div>
      </div>
    </div>
  )
}
