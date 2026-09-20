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
import { useToast } from '@/store/toast'
import type { Settings as SettingsShape } from '@/lib/types'

interface Draft {
  sheetH: string
  sheetW: string
  kerfOn: boolean
  kerfSize: string
  minLeftover: string
  showPrintAfterConfirm: boolean
  paperSize: 'A4' | 'Letter'
}

interface FieldErrors {
  sheetH?: string
  sheetW?: string
  kerfSize?: string
  minLeftover?: string
}

function draftFrom(s: SettingsShape): Draft {
  return {
    sheetH: fmt(s.sheetH),
    sheetW: fmt(s.sheetW),
    kerfOn: s.kerfOn,
    kerfSize: fmt(s.kerfSize),
    minLeftover: fmt(s.minLeftover),
    showPrintAfterConfirm: s.showPrintAfterConfirm,
    paperSize: s.paperSize,
  }
}

/** Sheet size, blade width and minimum leftover must be positive; minimum leftover may be 0. */
function validate(draft: Draft): { errors: FieldErrors; values?: Partial<SettingsShape> } {
  const errors: FieldErrors = {}
  const sheetH = parseInches(draft.sheetH)
  const sheetW = parseInches(draft.sheetW)
  const kerfSize = draft.kerfOn ? parseInches(draft.kerfSize) : 0
  const minTrim = draft.minLeftover.trim()
  const minLeftover = minTrim === '0' ? 0 : parseInches(draft.minLeftover)

  if (sheetH === null) errors.sheetH = 'Type a number like 96.'
  if (sheetW === null) errors.sheetW = 'Type a number like 48.'
  if (draft.kerfOn && kerfSize === null) errors.kerfSize = 'Type a number like 1/8.'
  if (minLeftover === null) errors.minLeftover = 'Type a number like 1, or 0 to keep everything.'

  if (Object.keys(errors).length > 0) return { errors }
  return {
    errors,
    values: {
      sheetH: sheetH!,
      sheetW: sheetW!,
      kerfSize: kerfSize ?? 0,
      minLeftover: minLeftover!,
      showPrintAfterConfirm: draft.showPrintAfterConfirm,
      paperSize: draft.paperSize,
    },
  }
}

export default function Settings() {
  const navigate = useNavigate()
  const email = useAuth((s) => s.email)
  const logout = useAuth((s) => s.logout)
  const settings = useSettings((s) => s.settings)
  const update = useSettings((s) => s.update)
  const toast = useToast((s) => s.show)

  const [draft, setDraft] = useState<Draft>(() => draftFrom(settings))
  const [errors, setErrors] = useState<FieldErrors>({})
  const [logoutOpen, setLogoutOpen] = useState(false)
  const [confirmSizeOpen, setConfirmSizeOpen] = useState(false)
  const [pendingValues, setPendingValues] = useState<Partial<SettingsShape> | null>(null)
  const [leaveOpen, setLeaveOpen] = useState(false)
  const [pendingRoute, setPendingRoute] = useState<string | null>(null)

  const saved = draftFrom(settings)
  const dirty =
    draft.sheetH !== saved.sheetH ||
    draft.sheetW !== saved.sheetW ||
    draft.kerfOn !== saved.kerfOn ||
    draft.kerfSize !== saved.kerfSize ||
    draft.minLeftover !== saved.minLeftover ||
    draft.showPrintAfterConfirm !== saved.showPrintAfterConfirm ||
    draft.paperSize !== saved.paperSize

  function patch(p: Partial<Draft>) {
    setDraft((d) => ({ ...d, ...p }))
  }

  function discard() {
    setDraft(draftFrom(settings))
    setErrors({})
  }

  function commitSave(values: Partial<SettingsShape>) {
    update(values)
    setConfirmSizeOpen(false)
    setPendingValues(null)
    setErrors({})
    toast('Settings saved.')
    if (pendingRoute) {
      const to = pendingRoute
      setPendingRoute(null)
      navigate(to)
    }
  }

  function onSave() {
    const { errors: fieldErrors, values } = validate(draft)
    setErrors(fieldErrors)
    if (!values) return

    const sizeChanged = values.sheetH !== settings.sheetH || values.sheetW !== settings.sheetW
    if (sizeChanged) {
      setPendingValues(values)
      setConfirmSizeOpen(true)
      return
    }
    commitSave(values)
  }

  function onNavigate(to: string) {
    if (!dirty) return true
    setPendingRoute(to)
    setLeaveOpen(true)
    return false
  }

  function leaveAndSave() {
    setLeaveOpen(false)
    // onSave() validates and either commits straight away or opens the size-change
    // dialog; either path's commitSave() then navigates to pendingRoute once done.
    onSave()
  }

  function leaveAndDiscard() {
    discard()
    setLeaveOpen(false)
    if (pendingRoute) {
      const to = pendingRoute
      setPendingRoute(null)
      navigate(to)
    }
  }

  function stay() {
    setLeaveOpen(false)
    setPendingRoute(null)
  }

  async function onLogout() {
    setLogoutOpen(false)
    await logout()
    navigate('/login')
  }

  return (
    <AppShell
      title="Settings"
      tab="settings"
      onNavigate={onNavigate}
      stickyBar={
        <div className="flex flex-none items-center justify-between gap-3 border-t border-hair border-border pt-3">
          <button
            type="button"
            onClick={discard}
            disabled={!dirty}
            className="text-[14px] text-muted-foreground underline-offset-4 hover:underline disabled:pointer-events-none disabled:opacity-40"
          >
            Discard
          </button>
          <Button size="lg" className="h-[52px] flex-1" disabled={!dirty} onClick={onSave}>
            Save changes
          </Button>
        </div>
      }
    >
      <div className='border border-border rounded-md p-2'>

      
      <div className="border-b border-border  py-1 px-2">
        <Label>Sheet size (in)</Label>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Input
              inputMode="text"
              autoComplete="off"
              value={draft.sheetH}
              className="h-[42px] border border-border-stronger bg-transparent px-3 text-[18px]"
              onChange={(e) => patch({ sheetH: e.target.value })}
            />
            {errors.sheetH && <p className="mt-1 text-[12.5px] text-danger-text">{errors.sheetH}</p>}
          </div>
          <div>
            <Input
              inputMode="text"
              autoComplete="off"
              value={draft.sheetW}
              className="h-[42px] border border-border-stronger bg-transparent px-3 text-[18px]"
              onChange={(e) => patch({ sheetW: e.target.value })}
            />
            {errors.sheetW && <p className="mt-1 text-[12.5px] text-danger-text">{errors.sheetW}</p>}
          </div>
        </div>
        <p className="mt-1.5 text-[12.5px] text-faint">Length, then width.</p>
      </div>

      <div className="border-b border-border py-3">
        <div className="flex items-center justify-between">
          <span className="text-[15px]">Include blade thickness</span>
          <Switch checked={draft.kerfOn} onCheckedChange={(v) => patch({ kerfOn: v })} />
        </div>
        <p className="mt-1.5 text-[12.5px] text-faint">
          Blade width: {draft.kerfSize} in. Used when the toggle is on.
        </p>
        {draft.kerfOn && (
          <div className="mt-2.5">
            <Label>Blade width (in)</Label>
            <Input
              inputMode="text"
              autoComplete="off"
              className="w-28"
              value={draft.kerfSize}
              onChange={(e) => patch({ kerfSize: e.target.value })}
            />
            {errors.kerfSize && <p className="mt-1 text-[12.5px] text-danger-text">{errors.kerfSize}</p>}
          </div>
        )}
      </div>

      <div className="border-b border-border py-3">
        <Label>Save leftovers bigger than (in)</Label>
        <Input
          inputMode="text"
          autoComplete="off"
          value={draft.minLeftover}
          onChange={(e) => patch({ minLeftover: e.target.value })}
        />
        {errors.minLeftover && <p className="mt-1 text-[12.5px] text-danger-text">{errors.minLeftover}</p>}
        <p className="mt-1.5 text-[12.5px] text-faint">Anything smaller is treated as waste.</p>
      </div>

      <div className="flex items-center justify-between border-b border-border py-3">
        <span className="text-[15px]">Rotate pieces</span>
        <span className="text-[14px] text-muted-foreground">Only if needed</span>
      </div>

      <div className="border-b  border-border py-3">
        <div className="flex items-center justify-between">
          <span className="text-[15px]">Show the print screen after every confirmed cut</span>
          <Switch
            checked={draft.showPrintAfterConfirm}
            onCheckedChange={(v) => patch({ showPrintAfterConfirm: v })}
          />
        </div>
        <p className="mt-1.5 text-[12.5px] text-faint">
          When off, Confirm cut goes straight back to Home. Print is always available from Job detail.
        </p>
      </div>

      <div className="border-b border-border py-3">
        <Label>Paper size</Label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => patch({ paperSize: 'A4' })}
            className={`h-10 flex-1 rounded-lg border-hair text-[14px] font-semibold ${
              draft.paperSize === 'A4' ? 'border-accent-border bg-accent-bg text-accent-text' : 'border-border-strong text-foreground'
            }`}
          >
            A4
          </button>
          <button
            type="button"
            onClick={() => patch({ paperSize: 'Letter' })}
            className={`h-10 flex-1 rounded-lg border-hair text-[14px] font-semibold ${
              draft.paperSize === 'Letter' ? 'border-accent-border bg-accent-bg text-accent-text' : 'border-border-strong text-foreground'
            }`}
          >
            Letter
          </button>
        </div>
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

      <Dialog open={confirmSizeOpen} onOpenChange={setConfirmSizeOpen}>
        <DialogContent>
          <DialogTitle>
            Change sheet size to {pendingValues ? fmt(pendingValues.sheetH!) : ''} ×{' '}
            {pendingValues ? fmt(pendingValues.sheetW!) : ''}?
          </DialogTitle>
          <DialogDescription>
            This applies to new plans only. Saved leftovers and past jobs keep their own sizes.
          </DialogDescription>
          <div className="mt-4 flex gap-2.5">
            <Button
              variant="outline"
              className="h-11 flex-1"
              onClick={() => {
                setConfirmSizeOpen(false)
                setPendingValues(null)
              }}
            >
              Cancel
            </Button>
            <Button className="h-11 flex-1" onClick={() => pendingValues && commitSave(pendingValues)}>
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={leaveOpen} onOpenChange={(open) => !open && stay()}>
        <DialogContent>
          <DialogTitle>Save your changes?</DialogTitle>
          <DialogDescription>You have changed settings that have not been saved yet.</DialogDescription>
          <div className="mt-4 flex flex-col gap-2.5">
            <Button className="h-11 w-full" onClick={leaveAndSave}>
              Save
            </Button>
            <div className="flex gap-2.5">
              <Button variant="outline" className="h-11 flex-1" onClick={leaveAndDiscard}>
                Discard
              </Button>
              <Button variant="outline" className="h-11 flex-1" onClick={stay}>
                Stay
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      </div>
    </AppShell>
  )
}
