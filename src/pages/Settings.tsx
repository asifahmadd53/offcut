import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { fmt, parseInches } from '@/lib/inches'
import { useAuth } from '@/store/auth'
import { useSettings } from '@/store/settings'

/** A field that only writes to settings when the user leaves it (commit on blur), per prompt 10.10. */
function CommitField({
  value,
  onCommit,
  className,
}: {
  value: number
  onCommit: (n: number) => void
  className?: string
}) {
  const [text, setText] = useState(fmt(value))
  const [error, setError] = useState<string | null>(null)

  function commit() {
    const parsed = parseInches(text)
    if (parsed === null) {
      setError('Type a number like 96.')
      setText(fmt(value))
      return
    }
    setError(null)
    setText(fmt(parsed))
    onCommit(parsed)
  }

  return (
    <div>
      <Input
        inputMode="text"
        autoComplete="off"
        className={className}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
      />
      {error && <p className="mt-1 text-[12.5px] text-danger-text">{error}</p>}
    </div>
  )
}

export default function Settings() {
  const navigate = useNavigate()
  const email = useAuth((s) => s.email)
  const logout = useAuth((s) => s.logout)
  const settings = useSettings((s) => s.settings)
  const update = useSettings((s) => s.update)
  const [logoutOpen, setLogoutOpen] = useState(false)

  async function onLogout() {
    setLogoutOpen(false)
    await logout()
    navigate('/login')
  }

  return (
    <AppShell title="Settings" tab="settings">
      <div className="border-b border-hair border-border py-3">
        <Label>Sheet size (in)</Label>
        <div className="grid grid-cols-2 gap-3">
          <CommitField value={settings.sheetH} onCommit={(n) => update({ sheetH: n })} />
          <CommitField value={settings.sheetW} onCommit={(n) => update({ sheetW: n })} />
        </div>
        <p className="mt-1.5 text-[12.5px] text-faint">Length, then width.</p>
      </div>

      <div className="border-b border-hair border-border py-3">
        <div className="flex items-center justify-between">
          <span className="text-[15px]">Include blade thickness</span>
          <Switch checked={settings.kerfOn} onCheckedChange={(v) => update({ kerfOn: v })} />
        </div>
        <p className="mt-1.5 text-[12.5px] text-faint">
          Blade width: {fmt(settings.kerfSize)} in. Used when the toggle is on.
        </p>
        {settings.kerfOn && (
          <div className="mt-2.5">
            <Label>Blade width (in)</Label>
            <CommitField
              value={settings.kerfSize}
              onCommit={(n) => update({ kerfSize: n })}
              className="w-28"
            />
          </div>
        )}
      </div>

      <div className="border-b border-hair border-border py-3">
        <Label>Save leftovers bigger than (in)</Label>
        <MinLeftoverField value={settings.minLeftover} onCommit={(n) => update({ minLeftover: n })} />
        <p className="mt-1.5 text-[12.5px] text-faint">Anything smaller is treated as waste.</p>
      </div>

      <div className="flex items-center justify-between border-b border-hair border-border py-3">
        <span className="text-[15px]">Rotate pieces</span>
        <span className="text-[14px] text-muted-foreground">Only if needed</span>
      </div>

      <div className="py-4">
        <p className="mb-0.5 text-[13px] text-muted-foreground">Signed in as</p>
        <p className="text-[15px]">{email}</p>
      </div>

      <Dialog open={logoutOpen} onOpenChange={setLogoutOpen}>
        <Button variant="outline" className="h-12 w-full" onClick={() => setLogoutOpen(true)}>
          Log out
        </Button>
        <DialogContent>
          <DialogTitle>Log out?</DialogTitle>
          <DialogDescription>You will need internet to log in again on this phone.</DialogDescription>
          <div className="mt-4 flex gap-2.5">
            <Button variant="outline" className="h-11 flex-1" onClick={() => setLogoutOpen(false)}>
              Stay
            </Button>
            <Button className="h-11 flex-1" onClick={onLogout}>
              Log out
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  )
}

/** Minimum leftover accepts 0 (keep everything), unlike piece sizes which must be positive. */
function MinLeftoverField({ value, onCommit }: { value: number; onCommit: (n: number) => void }) {
  const [text, setText] = useState(fmt(value))
  const [error, setError] = useState<string | null>(null)

  function commit() {
    const trimmed = text.trim()
    let parsed: number | null = trimmed === '0' ? 0 : parseInches(text)
    if (parsed === null) {
      setError('Type a number like 1, or 0 to keep everything.')
      setText(fmt(value))
      return
    }
    setError(null)
    setText(fmt(parsed))
    onCommit(parsed)
  }

  return (
    <div>
      <Input
        inputMode="text"
        autoComplete="off"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
      />
      {error && <p className="mt-1 text-[12.5px] text-danger-text">{error}</p>}
    </div>
  )
}
