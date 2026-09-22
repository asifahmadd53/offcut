import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { Stepper } from '@/components/Stepper'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { parseInches, fmtDims, fmtLeft } from '@/lib/inches'
import { plural } from '@/lib/format'
import { knownClients, resolveClient } from '@/lib/clients'
import { useJob, type LeftoverFitCheck } from '@/store/job'
import { useSettings } from '@/store/settings'
import { useData } from '@/store/data'
import { useToast } from '@/store/toast'
import { Switch } from '@/components/ui/switch'
type FieldError = 'zero' | 'nan' | null

function fieldMessage(which: 'Width' | 'Height', err: FieldError): string | null {
  if (err === 'zero') return `${which} must be more than 0. Try 23 or 22.5.`
  if (err === 'nan') return 'That is not a size. Type a number like 23 or 22.5.'
  return null
}

export default function NewJob() {
  const navigate = useNavigate()
  const pieces = useJob((s) => s.pieces)
  const clientId = useJob((s) => s.clientId)
  const clientName = useJob((s) => s.clientName)
  const setClient = useJob((s) => s.setClient)
  const addPiece = useJob((s) => s.addPiece)
  const removePiece = useJob((s) => s.removePiece)
  const buildPlan = useJob((s) => s.buildPlan)
  const checkLeftoverFit = useJob((s) => s.checkLeftoverFit)
  const buildPlanWithNewSheet = useJob((s) => s.buildPlanWithNewSheet)
  const onlyLeftoverId = useJob((s) => s.onlyLeftoverId)
  const setOnlyLeftoverId = useJob((s) => s.setOnlyLeftoverId)
  const settings = useSettings((s) => s.settings)
  const updateSettings = useSettings((s) => s.update)
  const toast = useToast((s) => s.show)
  const freeLeftovers = useData((s) => s.derived.freeLeftovers)
  const cuts = useData((s) => s.cuts)
  const clientOptions = knownClients(cuts)

  const [clientInput, setClientInput] = useState(clientName)
  const [clientTouched, setClientTouched] = useState(false)

  function commitClient(name: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    const resolved = resolveClient(trimmed, clientOptions)
    setClient(resolved.id, resolved.name)
    setClientInput(resolved.name)
  }

  const [misfit, setMisfit] = useState<LeftoverFitCheck | null>(null)
  const onlyLeftover = onlyLeftoverId ? freeLeftovers.find((l) => l.id === onlyLeftoverId) : undefined

  const [width, setWidth] = useState('')
  const [height, setHeight] = useState('')
  const [qty, setQty] = useState(1)
  const [touchedW, setTouchedW] = useState(false)
  const [touchedH, setTouchedH] = useState(false)
  const [triedAdd, setTriedAdd] = useState(false)
  const widthRef = useRef<HTMLInputElement>(null)

  const wVal = parseInches(width)
  const hVal = parseInches(height)
  const wErr: FieldError = width.trim() === '' ? null : wVal === null ? 'nan' : null
  const hErr: FieldError = height.trim() === '' ? null : hVal === null ? 'nan' : null
  // parseInches already rejects <= 0, so a numeric-looking zero/negative reads as null too;
  // distinguish "typed but rejected because non-positive" from "not a number at all".
  const looksNumeric = (s: string) => /^-?\d/.test(s.trim())
  const wZero = width.trim() !== '' && wVal === null && looksNumeric(width) && Number(width) <= 0
  const hZero = height.trim() !== '' && hVal === null && looksNumeric(height) && Number(height) <= 0

  const showWErr = (touchedW || triedAdd) && (wErr || wZero)
  const showHErr = (touchedH || triedAdd) && (hErr || hZero)

  const bothValid = wVal !== null && hVal !== null
  const tooBig =
    bothValid &&
    !(wVal! <= settings.sheetW && hVal! <= settings.sheetH) &&
    !(hVal! <= settings.sheetW && wVal! <= settings.sheetH)

  function doAdd() {
    setTriedAdd(true)
    if (!bothValid || tooBig) return
    addPiece(wVal!, hVal!, qty)
    setWidth('')
    setHeight('')
    setQty(1)
    setTriedAdd(false)
    setTouchedW(false)
    setTouchedH(false)
    widthRef.current?.focus()
  }

  function onMakePlan() {
    setClientTouched(true)
    if (!clientId) {
      commitClient(clientInput)
      if (!clientInput.trim()) return
    }

    // If a valid piece is typed but not added yet, add it first.
    if (bothValid && !tooBig) {
      addPiece(wVal!, hVal!, qty)
    }

    if (onlyLeftoverId) {
      // Leftover-restricted planning must never silently open a new sheet: check
      // the fit first, and only navigate once every piece fits this leftover alone.
      const check = checkLeftoverFit()
      if (check && !check.fits) {
        setMisfit(check)
        return
      }
    }

    buildPlan([])
    navigate('/plan')
  }

  function useNewSheetForRest() {
    buildPlanWithNewSheet()
    setMisfit(null)
    navigate('/plan')
  }

  function changeSize() {
    setMisfit(null)
  }

  function chooseAnotherLeftover() {
    setMisfit(null)
    setOnlyLeftoverId(null)
    navigate('/stock')
  }

  function cleanNumber(raw: string): string {
    let v = raw.replace(/,/g, '.').replace(/[^0-9.]/g, '')
    const firstDot = v.indexOf('.')
    if (firstDot !== -1) {
      v = v.slice(0, firstDot + 1) + v.slice(firstDot + 1).replace(/\./g, '')
    }
    if (v.startsWith('.')) v = '0' + v
    return v
  }

  const hasTypedValid = bothValid && !tooBig
  const canMakePlan = (pieces.length > 0 || hasTypedValid) && clientInput.trim() !== ''
  const showClientErr = clientTouched && clientInput.trim() === ''

  return (
    <AppShell title="New job" back="/">
      {onlyLeftoverId && (
        <div className="mb-3 rounded-lg bg-accent-bg px-3 py-2 text-[13px] text-accent-text">
          Planning with leftover {onlyLeftover?.letter ?? ''}
          {onlyLeftover ? ` (${fmtLeft(onlyLeftover.w, onlyLeftover.h)})` : ''} only.
        </div>
      )}

      <div className="mb-3.5">
        <Label htmlFor="client">Client name</Label>
        <Input
          id="client"
          type="text"
          inputMode="text"
          autoComplete="off"
          list="client-options"
          placeholder="e.g. Ali"
          enterKeyHint="next"
          className="h-[42px] border border-border-stronger bg-transparent px-3 text-[16px]"
          value={clientInput}
          onChange={(e) => setClientInput(e.target.value)}
          onBlur={() => {
            setClientTouched(true)
            commitClient(clientInput)
          }}
        />
        <datalist id="client-options">
          {clientOptions.map((c) => (
            <option key={c.id} value={c.name} />
          ))}
        </datalist>
        {showClientErr ? (
          <p className="mt-1 text-[13px] text-danger-text">Type who this job is for.</p>
        ) : (
          <p className="mt-1 text-[12px] text-faint">
            Their leftovers stay separate from every other client's.
          </p>
        )}
      </div>

      {tooBig && (
        <div className="mb-3 rounded-lg bg-warning-bg p-3 text-[14px] text-warning-text">
          <p className="mb-0 font-semibold">Too big for a sheet.</p>
          <p className="mb-0">
            Your sheets are {settings.sheetW} × {settings.sheetH} in. A {width} × {height} piece
            will not fit even turned.
          </p>
        </div>
      )}

      <div className="mb-2.5 grid grid-cols-1 gap-3 p-2 lg:grid-cols-2">
        <div>
          <Label htmlFor="w">Width (in)</Label>
          <Input
            id="w"
            ref={widthRef}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder='22.3'
            enterKeyHint="next"
            className="h-[42px] border border-border-stronger bg-transparent px-3 text-[18px]"
            value={width}
            onChange={(e) => setWidth(cleanNumber(e.target.value))}
            onBlur={() => {
              setWidth((v) => v.replace(/\.$/, ''))
              setTouchedW(true)
            }}
          />
        </div>
        <div>
          <Label htmlFor="h">Height (in)</Label>
          <Input
            id="h"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            enterKeyHint="done"
            placeholder='77.2'
            className="h-[42px] border border-border-stronger bg-transparent px-3 text-[18px]"
            value={height}
            onChange={(e) => setHeight(cleanNumber(e.target.value))}
            onBlur={() => {
              setHeight((v) => v.replace(/\.$/, ''))
              setTouchedH(true)
            }}
          />
        </div>
      </div>
      {showWErr ? (
        <p className="mb-3.5 text-[13px] text-danger-text">
          {fieldMessage('Width', wZero ? 'zero' : 'nan')}
        </p>
      ) : showHErr ? (
        <p className="mb-3.5 text-[13px] text-danger-text">
          {fieldMessage('Height', hZero ? 'zero' : 'nan')}
        </p>
      ) : (
          <p className="mb-3.5 text-[12px] text-faint">Use numbers like 23 or 22.5</p>
      )}

      <Label>How many pieces</Label>
      <div className="mb-3">
        <Stepper value={qty} onChange={setQty} />
      </div>

      <Button
        type="button"
        variant="outline"
        size="default"
        className="mb-4.5 h-11 w-full"
        disabled={!bothValid || tooBig}
        onClick={doAdd}
      >
        + Add this piece
      </Button>

      <p className="my-1 mt-2 text-[13px] text-muted-foreground">Pieces in this job</p>
      {pieces.length === 0 ? (
        <div className="mb-4.5 rounded-lg bg-muted p-4.5 text-center text-[13px] text-muted-foreground">
          Add a piece above to begin.
        </div>
      ) : (
        <div className="mb-4.5">
          {pieces.map((p) => (
            <div key={p.id} className="flex items-center justify-between border-b border-hair border-border rounded-md px-2 py-1">
              <span className="text-[16px] font-semibold">
                {fmtDims(p.w, p.h)} <span className="font-normal text-muted-foreground">· {p.qty} pcs</span>
              </span>
              <button
                type="button"
                onClick={() => removePiece(p.id)}
                aria-label={`Remove ${fmtDims(p.w, p.h)}`}
                className="flex h-9 w-9 items-center justify-center text-muted-foreground"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mb-4.5 mt-2 flex w-full items-center justify-between py-1">
        <label htmlFor="blade" className="flex-1 cursor-pointer text-[15px]">
          Include blade thickness
        </label>
        <Switch
          id="blade"
          checked={settings.kerfOn}
          onCheckedChange={(next) => {
            updateSettings({ kerfOn: next })
            toast(next ? 'Blade thickness on' : 'Blade thickness off')
          }}
        />
      </div>

      <Button size="lg" className="w-full" disabled={!canMakePlan} onClick={onMakePlan}>
        Make cutting plan
      </Button>

      <Dialog open={!!misfit} onOpenChange={(open) => !open && setMisfit(null)}>
        <DialogContent>
          <DialogTitle>Doesn&rsquo;t fit this leftover</DialogTitle>
          <DialogDescription asChild>
            <div>
              {misfit && (
                <>
                  <p className="mb-2">
                    {misfit.misfits
                      .map(
                        (m) =>
                          `The ${fmtDims(m.w, m.h)}${m.qty > 1 ? ` (${plural(m.qty, 'piece')})` : ''} piece does not fit in leftover ${misfit.leftover.letter} (${fmtLeft(misfit.leftover.w, misfit.leftover.h)}), even turned.`,
                      )
                      .join(' ')}
                  </p>
                  {misfit.someFit && <p className="mb-0">The other pieces fit.</p>}
                </>
              )}
            </div>
          </DialogDescription>
          <div className="mt-4 flex flex-col gap-2.5">
            <Button className="h-12 w-full" onClick={useNewSheetForRest}>
              Use a new sheet
            </Button>
            <Button variant="outline" className="h-12 w-full" onClick={changeSize}>
              Change the size
            </Button>
            <button
              type="button"
              onClick={chooseAnotherLeftover}
              className="text-[14px] text-accent-text underline-offset-4 hover:underline"
            >
              Choose another leftover
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  )
}
