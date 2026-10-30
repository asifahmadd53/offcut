import { useRef, useState } from 'react'
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
import { SheetLayoutDialog } from '@/components/SheetLayoutDialog'
import { layoutSummary } from '@/lib/layout'
import { fmtIn, parseSize, UNITS, UNIT_NAME, type Unit } from '@/lib/inches'
import { useAuth } from '@/store/auth'
import { useSettings } from '@/store/settings'
import { toast } from 'sonner'
import { DEFAULT_SETTINGS, type LayoutMethod, type Settings as SettingsShape } from '@/lib/types'

export interface Draft {
  sheetW: string
  sheetH: string
  kerfOn: boolean
  kerfSize: string
  minLeftover: string
  paperSize: 'A4' | 'Letter'
  /** The unit the four size fields above are written in. */
  unit: Unit
  /** How new jobs are cut, and whether their sheets have a grain, unless a job says otherwise. */
  layoutMethod: LayoutMethod
  layoutLevels: 2 | 3
  grain: boolean
}

interface FieldErrors {
  sheetW?: string
  sheetH?: string
  kerfSize?: string
  minLeftover?: string
}

/** A saved blade width of 0 means "not set"; show the usual 1/8 inch in whatever unit the fields use. */
const DEFAULT_KERF_INCHES = 0.125

export function draftFrom(s: SettingsShape): Draft {
  const unit: Unit = s.unit ?? DEFAULT_SETTINGS.unit
  return {
    unit,
    sheetW: fmtIn(s.sheetW, unit),
    sheetH: fmtIn(s.sheetH, unit),
    kerfOn: s.kerfOn,
    // A saved kerfSize of 0 means "not set" (the toggle was off when it was saved) —
    // show a sensible blade width instead of 0 so the disabled field always displays
    // something the carpenter would recognize, not a value that means "no blade".
    kerfSize: fmtIn(s.kerfSize > 0 ? s.kerfSize : DEFAULT_KERF_INCHES, unit),
    minLeftover: fmtIn(s.minLeftover, unit),
    paperSize: s.paperSize,
    // Settings saved before these existed lack them: the plain defaults apply.
    layoutMethod: s.layoutMethod ?? DEFAULT_SETTINGS.layoutMethod,
    layoutLevels: s.layoutLevels ?? DEFAULT_SETTINGS.layoutLevels,
    grain: s.grain ?? DEFAULT_SETTINGS.grain,
  }
}

/** Sheet size, blade width and minimum leftover must be positive; minimum leftover may be 0. */
type SizeField = 'sheetW' | 'sheetH' | 'kerfSize' | 'minLeftover'

export function validate(draft: Draft, saved?: SettingsShape, exactSizes: Partial<Record<SizeField, { text: string; inches: number }>> = {}): { errors: FieldErrors; values?: Partial<SettingsShape> } {
  const errors: FieldErrors = {}
  // A field left exactly as it was shown keeps its saved size: the text is a rounded copy of it (1/8 inch shows as 3.18 mm).
  const read = (field: SizeField): number | null => {
    const text = draft[field]
    if (exactSizes[field]?.text === text) return exactSizes[field]!.inches
    if (saved && draft.unit === (saved.unit ?? 'in') && text === draftFrom(saved)[field] && (field !== 'kerfSize' || saved.kerfSize > 0)) return saved[field]
    return parseSize(text, draft.unit)
  }
  const sheetW = read('sheetW')
  const sheetH = read('sheetH')
  const kerfSize = draft.kerfOn ? read('kerfSize') : 0
  const minTrim = draft.minLeftover.trim()
  const minLeftover = minTrim === '0' ? 0 : read('minLeftover')

  if (sheetW === null) errors.sheetW = `Type a number like ${fmtIn(48, draft.unit)}.`
  if (sheetH === null) errors.sheetH = `Type a number like ${fmtIn(96, draft.unit)}.`
  if (draft.kerfOn && kerfSize === null) errors.kerfSize = `Type a number like ${fmtIn(DEFAULT_KERF_INCHES, draft.unit)}.`
  if (minLeftover === null) errors.minLeftover = `Type a number like ${fmtIn(1, draft.unit)}, or 0 to keep everything.`

  if (Object.keys(errors).length > 0) return { errors }
  return {
    errors,
    values: {
      sheetW: sheetW!,
      sheetH: sheetH!,
      kerfOn: draft.kerfOn,
      kerfSize: kerfSize ?? 0,
      minLeftover: minLeftover!,
      paperSize: draft.paperSize,
      unit: draft.unit,
      layoutMethod: draft.layoutMethod,
      layoutLevels: draft.layoutLevels,
      grain: draft.grain,
    },
  }
}

export default function Settings() {
  const navigate = useNavigate()
  const email = useAuth((s) => s.email)
  const logout = useAuth((s) => s.logout)
  const settings = useSettings((s) => s.settings)
  const update = useSettings((s) => s.update)

  const [draft, setDraft] = useState<Draft>(() => draftFrom(settings))
  const [errors, setErrors] = useState<FieldErrors>({})
  const [logoutOpen, setLogoutOpen] = useState(false)
  const [saveOpen, setSaveOpen] = useState(false)
  const [confirmSizeOpen, setConfirmSizeOpen] = useState(false)
  const [pendingValues, setPendingValues] = useState<Partial<SettingsShape> | null>(null)
  const [leaveOpen, setLeaveOpen] = useState(false)
  const [layoutOpen, setLayoutOpen] = useState(false)
  const [pendingRoute, setPendingRoute] = useState<string | null>(null)

  // The last draft a save actually completed with. Compared alongside `settings` (not
  // instead of it) so "no unsaved changes" is correct the instant a save finishes, even
  // if this component hasn't yet re-rendered with the freshly updated settings from the
  // store — closes any timing gap between a successful save and the next navigation.
  const [lastSaved, setLastSaved] = useState<Draft | null>(null)
  // The exact size (inches) behind each size field's text after a change of unit, so going 1/8 in -> ft -> in does not drift to 0.12.
  const exact = useRef<Partial<Record<SizeField, { text: string; inches: number }>>>({})

  const saved = draftFrom(settings)
  const sameAsDraft = (a: Draft) =>
    draft.sheetW === a.sheetW &&
    draft.sheetH === a.sheetH &&
    draft.kerfOn === a.kerfOn &&
    draft.kerfSize === a.kerfSize &&
    draft.minLeftover === a.minLeftover &&
    draft.paperSize === a.paperSize &&
    draft.unit === a.unit &&
    draft.layoutMethod === a.layoutMethod &&
    draft.layoutLevels === a.layoutLevels &&
    draft.grain === a.grain
  const dirty = !sameAsDraft(saved) && !(lastSaved && sameAsDraft(lastSaved))

  function patch(p: Partial<Draft>) {
    setDraft((d) => ({ ...d, ...p }))
    setLastSaved(null)
  }

  /** Switching unit rewrites the four size fields in the new unit, from the real size when a field is untouched. */
  function changeUnit(unit: Unit) {
    if (unit === draft.unit) return
    const next: Partial<Record<SizeField, { text: string; inches: number }>> = {}
    const convert = (field: SizeField) => {
      const untouched = draft.unit === (settings.unit ?? 'in') && draft[field] === saved[field] && (field !== 'kerfSize' || settings.kerfSize > 0)
      const known = exact.current[field]
      const inches = untouched ? settings[field] : known && known.text === draft[field] ? known.inches : parseSize(draft[field], draft.unit)
      if (inches === null || inches === undefined) return draft[field]
      const text = fmtIn(inches, unit)
      next[field] = { text, inches }
      return text
    }
    // Worked out here, not inside the state update, so a repeated run (React's dev double-run) cannot lose the exact sizes.
    setDraft({ ...draft, unit, sheetW: convert('sheetW'), sheetH: convert('sheetH'), kerfSize: convert('kerfSize'), minLeftover: convert('minLeftover') })
    exact.current = next
    setLastSaved(null)
    setErrors({})
  }

  function discard() {
    setDraft(draftFrom(settings))
    setLastSaved(null)
    setErrors({})
  }

  function commitSave(values: Partial<SettingsShape>) {
    update(values)
    setLastSaved(draft)
    setConfirmSizeOpen(false)
    setPendingValues(null)
    setErrors({})
    toast.success('Settings saved.')
    if (pendingRoute) {
      const to = pendingRoute
      setPendingRoute(null)
      navigate(to)
    }
  }

  function onSave() {
    const { errors: fieldErrors, values } = validate(draft, settings, exact.current)
    setErrors(fieldErrors)
    if (!values) return

    setSaveOpen(false)
    const sizeChanged = values.sheetW !== settings.sheetW || values.sheetH !== settings.sheetH
    if (sizeChanged) {
      setPendingValues(values)
      setConfirmSizeOpen(true)
      return
    }
    commitSave(values)
  }

  function discardFromPopup() {
    discard()
    setSaveOpen(false)
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
    >
      <div className='border border-border rounded-md p-2'>


        <div className="border-b border-border py-3 px-2">
          <Label>Measuring unit</Label>
          <div role="radiogroup" aria-label="Measuring unit" className="grid grid-cols-4 gap-2">
            {UNITS.map((u) => {
              const selected = draft.unit === u
              return (
                <button
                  key={u}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={UNIT_NAME[u]}
                  onClick={() => changeUnit(u)}
                  className={`flex h-[38px] items-center justify-center rounded-lg border px-2 text-center transition-colors ${selected ? 'border-accent-border bg-accent-bg' : 'border-border-strong bg-background hover:bg-muted'}`}
                >
                  <span className={`text-[15px] font-semibold ${selected ? 'text-accent-text' : 'text-foreground'}`}>{u}</span>
                </button>
              )
            })}
          </div>
          <p className="mb-0 mt-1.5 text-[12.5px] text-faint">Sizes you type and see use this unit ({UNITS.map((u) => UNIT_NAME[u].toLowerCase()).join(', ')}). Cutting stays exact.</p>
        </div>

        <div className="border-b border-border  py-1 px-2">
          <Label>Sheet size ({draft.unit})</Label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="sheet-width" className="mb-1 text-[12.5px] font-normal text-muted-foreground">
                Width
              </Label>
              <Input
                id="sheet-width"
                inputMode="text"
                autoComplete="off"
                value={draft.sheetW}
                className=" border border-border-stronger bg-transparent px-3 text-[18px]"
                onChange={(e) => patch({ sheetW: e.target.value })}
              />
              {errors.sheetW && <p className="mt-1 text-[12.5px] text-danger-text">{errors.sheetW}</p>}
            </div>
            <div>
              <Label htmlFor="sheet-height" className="mb-1 text-[12.5px] font-normal text-muted-foreground">
                Height
              </Label>
              <Input
                id="sheet-height"
                inputMode="text"
                autoComplete="off"
                value={draft.sheetH}
                className="border border-border-stronger bg-transparent px-3 text-[18px]"
                onChange={(e) => patch({ sheetH: e.target.value })}
              />
              {errors.sheetH && <p className="mt-1 text-[12.5px] text-danger-text">{errors.sheetH}</p>}
            </div>
          </div>
          <p className="mt-1.5 text-[12.5px] text-faint">Width across, then height. Default {fmtIn(48, draft.unit)} × {fmtIn(96, draft.unit)}.</p>
        </div>

        <div className="border-b border-border py-3">
          <div className="flex items-center justify-between">
            <span className="text-[15px]">Include blade thickness</span>
            <Switch checked={draft.kerfOn} onCheckedChange={(v) => patch({ kerfOn: v })} />
          </div>
          <p className="mt-1.5 text-[12.5px] text-faint">
            Blade width: {draft.kerfSize} {draft.unit}. Used when the toggle is on.
          </p>
          <div className="mt-2.5">
            <Label>Blade width ({draft.unit})</Label>
            <Input
              inputMode="text"
              autoComplete="off"
              disabled={!draft.kerfOn}
              className=" border border-border-stronger bg-transparent px-3 text-[18px]"
              value={draft.kerfSize}
              onChange={(e) => patch({ kerfSize: e.target.value })}
            />
            {errors.kerfSize && <p className="mt-1 text-[12.5px] text-danger-text">{errors.kerfSize}</p>}
          </div>
        </div>

        <div className="border-b border-border py-3">
          <Label>Save leftovers bigger than ({draft.unit})</Label>
          <Input
            inputMode="text"
            autoComplete="off"
            value={draft.minLeftover}
            className=" border border-border-stronger bg-transparent px-3 text-[18px]"
            onChange={(e) => patch({ minLeftover: e.target.value })}
          />
          {errors.minLeftover && <p className="mt-1 text-[12.5px] text-danger-text">{errors.minLeftover}</p>}
          <p className="mt-1.5 text-[12.5px] text-faint">Anything smaller is treated as waste.</p>
        </div>

        <div className="border-b border-border py-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[15px]">Sheet layout</span>
            <Button variant="outline" size="lg" onClick={() => setLayoutOpen(true)}>
              Change
            </Button>
          </div>
          <p className="mb-0 mt-1.5 text-[12.5px] text-faint">
            {layoutSummary({ method: draft.layoutMethod, levels: draft.layoutLevels, grain: draft.grain })}.
            {!draft.grain && ' A piece is turned only if needed.'} New jobs start with this; a job can change it.
          </p>
        </div>

        <SheetLayoutDialog
          open={layoutOpen}
          onOpenChange={setLayoutOpen}
          value={{ method: draft.layoutMethod, levels: draft.layoutLevels, grain: draft.grain }}
          title="Sheet layout for new jobs"
          description="Every new job starts with this. A job can still choose its own on the New job screen."
          saveLabel="Use this layout"
          onSave={(l) => patch({ layoutMethod: l.method, layoutLevels: l.levels, grain: l.grain })}
        />

        <div className="border-b border-border py-3">
          <Label>Paper size</Label>
          <div className="grid grid-cols-2 gap-3">
            {(['A4', 'Letter'] as const).map((size) => {
              const selected = draft.paperSize === size
              return (
                <button
                  key={size}
                  type="button"
                  onClick={() => patch({ paperSize: size })}
                  aria-pressed={selected}
                  className={`flex h-[38px] items-center justify-between rounded-lg border px-4 py-0 text-left transition-colors ${selected
                      ? 'border-accent-border bg-accent-bg'
                      : 'border-border-strong bg-background hover:bg-muted'
                    }`}
                >
                  <div className='flex justify-between w-full items-center'>
                    <p className={`mb-0 text-[15px] font-semibold ${selected ? 'text-accent-text' : 'text-foreground'}`}>
                      {size}
                    </p>
                    <p className="mb-0 text-[12px] text-muted-foreground">
                      {size === 'A4' ? '210 × 297 mm' : '8.5 × 11 in'}
                    </p>
                  </div>
                  {/* <span
                  className={`flex h-5 w-5 flex-none items-center justify-center rounded-full border-2 ${
                    selected ? 'border-accent-border bg-accent-border' : 'border-border-strong'
                  }`}
                >
                  {selected && <span className="h-2 w-2 rounded-full bg-white" />}
                </span> */}
                </button>
              )
            })}
          </div>
        </div>

        <div className="py-4">
          <p className="mb-0.5 text-[13px] text-muted-foreground">Signed in as</p>
          <p className="text-[15px]">{email}</p>
        </div>

        <Button size="lg" className="mb-2.5 w-full" disabled={!dirty} onClick={() => setSaveOpen(true)}>
          Save changes
        </Button>

        {/* lg+ already has Log out in AppShell's own sidebar — this is the only way to log
          out below that width, so it stays here for md and phone. */}
        <Button size="lg" variant="outline" className="w-full lg:hidden" onClick={() => setLogoutOpen(true)}>
          Log out
        </Button>

        <Dialog open={logoutOpen} onOpenChange={setLogoutOpen}>
          <DialogContent>
            <DialogTitle>Log out?</DialogTitle>
            <DialogDescription>You will need internet to log in again on this phone.</DialogDescription>
            <div className="mt-4 flex gap-2.5">
              <Button size="lg" variant="outline" className="flex-1" onClick={() => setLogoutOpen(false)}>
                Stay
              </Button>
              <Button size="lg" className="flex-1" onClick={onLogout}>
                Log out
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={saveOpen} onOpenChange={(open) => !open && setSaveOpen(false)}>
          <DialogContent>
            <DialogTitle>Save your changes?</DialogTitle>
            <DialogDescription>Your new settings will apply to new plans.</DialogDescription>
            <div className="mt-4 flex flex-col gap-2.5">
              <Button size={"lg"} className="w-full" onClick={onSave}>
                Save
              </Button>
              <Button size={"lg"} variant="outline" className="w-full" onClick={discardFromPopup}>
                Discard
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={confirmSizeOpen} onOpenChange={setConfirmSizeOpen}>
          <DialogContent>
            <DialogTitle>
              Change sheet size to {pendingValues ? fmtIn(pendingValues.sheetW!, draft.unit) : ''} ×{' '}
              {pendingValues ? fmtIn(pendingValues.sheetH!, draft.unit) : ''} {draft.unit}?
            </DialogTitle>
            <DialogDescription>
              This applies to new plans only. Saved leftovers and past jobs keep their own sizes.
            </DialogDescription>
            <div className="mt-4 flex gap-2.5">
              <Button
              size={"lg"}
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setConfirmSizeOpen(false)
                  setPendingValues(null)
                }}
              >
                Cancel
              </Button>
              <Button size="lg" className="flex-1" onClick={() => pendingValues && commitSave(pendingValues)}>
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
              <Button size="lg" className="w-full" onClick={leaveAndSave}>
                Save
              </Button>
              <div className="flex gap-2.5">
                <Button size="lg" variant="outline" className=" flex-1" onClick={leaveAndDiscard}>
                  Discard
                </Button>
                <Button size="lg" variant="outline" className=" flex-1" onClick={stay}>
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
