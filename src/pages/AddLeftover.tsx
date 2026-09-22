import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { Stepper } from '@/components/Stepper'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { parseInches } from '@/lib/inches'
import { plural } from '@/lib/format'
import { knownClients, resolveClient } from '@/lib/clients'
import { saveCut } from '@/lib/db'
import { getDeviceId, uid } from '@/lib/id'
import { useAuth } from '@/store/auth'
import { useData } from '@/store/data'
import { useToast } from '@/store/toast'
import type { CutDoc, SheetPlan } from '@/lib/types'

export default function AddLeftover() {
  const navigate = useNavigate()
  const uidAuth = useAuth((s) => s.uid)
  const toast = useToast((s) => s.show)
  const cuts = useData((s) => s.cuts)
  const clientOptions = knownClients(cuts)

  const [width, setWidth] = useState('')
  const [height, setHeight] = useState('')
  const [qty, setQty] = useState(1)
  const [touched, setTouched] = useState(false)
  const [clientInput, setClientInput] = useState('')
  const widthRef = useRef<HTMLInputElement>(null)

  const wVal = parseInches(width)
  const hVal = parseInches(height)
  const bothValid = wVal !== null && hVal !== null
  const looksNumeric = (s: string) => /^-?\d/.test(s.trim())
  const wZero = width.trim() !== '' && wVal === null && looksNumeric(width) && Number(width) <= 0
  const hZero = height.trim() !== '' && hVal === null && looksNumeric(height) && Number(height) <= 0
  const showErr = touched && (wVal === null || hVal === null) && (width.trim() !== '' || height.trim() !== '')

  function errMessage(): string {
    if (wZero) return 'Width must be more than 0. Try 23 or 22.5.'
    if (hZero) return 'Height must be more than 0. Try 23 or 22.5.'
    return 'That is not a size. Type a number like 23 or 22.5.'
  }

  function onAdd() {
    setTouched(true)
    if (!bothValid || !uidAuth || !clientInput.trim()) return
    const client = resolveClient(clientInput, clientOptions)

    const sheets: SheetPlan[] = Array.from({ length: qty }, () => ({
      sheetId: uid(),
      sheetW: wVal!,
      sheetH: hVal!,
      sheetDate: Date.now(),
      isNew: true,
      manual: true,
      region: { x: 0, y: 0, w: wVal!, h: hVal! },
      placements: [],
      newLeftovers: [{ id: uid(), x: 0, y: 0, w: wVal!, h: hVal!, letter: 'A' }],
      steps: [],
    }))

    const doc: Omit<CutDoc, 'syncedAt'> = {
      id: uid(),
      type: 'manual',
      createdAt: Date.now(),
      deviceId: getDeviceId(),
      sheets,
      clientId: client.id,
      clientName: client.name,
    }
    saveCut(uidAuth, doc) // fire and forget, per R10
    toast(`${plural(qty, 'leftover')} added.`)
    navigate(`/client/${client.id}`)
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


  return (
    <AppShell title="Add leftover by hand" back="/">
      <p className="mb-4 text-[13px] text-muted-foreground">
        For offcuts already standing in your workshop.
      </p>

      <div className="mb-3.5">
        <Label htmlFor="al-client">Client name</Label>
        <Input
          id="al-client"
          type="text"
          inputMode="text"
          autoComplete="off"
          list="al-client-options"
          placeholder="e.g. Ali"
          className="h-[42px] border border-border-stronger bg-transparent px-3 text-[16px]"
          value={clientInput}
          onChange={(e) => setClientInput(e.target.value)}
          onBlur={() => setTouched(true)}
        />
        <datalist id="al-client-options">
          {clientOptions.map((c) => (
            <option key={c.id} value={c.name} />
          ))}
        </datalist>
        {touched && !clientInput.trim() && (
          <p className="mt-1 text-[13px] text-danger-text">Type whose offcut this is.</p>
        )}
      </div>

      <div className="mb-2.5 grid grid-cols-1 gap-3 p-2 lg:grid-cols-2">
        <div>
          <Label htmlFor="aw">Width (in)</Label>
          <Input
            id="aw"
            ref={widthRef}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            enterKeyHint="next"
            className="h-[42px] border border-border-stronger bg-transparent px-3 text-[18px]"
            value={width}
            onChange={(e) => setWidth(cleanNumber(e.target.value))}
            onBlur={() => {
              setWidth((v) => v.replace(/\.$/, ''))
              setTouched(true)
            }}
          />
        </div>
        <div>
          <Label htmlFor="ah">Height (in)</Label>
          <Input
            id="ah"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            enterKeyHint="done"
            className="h-[42px] border border-border-stronger bg-transparent px-3 text-[18px]"
            value={height}
            onChange={(e) => setHeight(cleanNumber(e.target.value))}
            onBlur={() => {
              setHeight((v) => v.replace(/\.$/, ''))
              setTouched(true)
            }}
          />
        </div>
      </div>

      {showErr ? (
        <p className="mb-3.5 text-[13px] text-danger-text">{errMessage()}</p>
      ) : (
        <p className="mb-3.5 text-[12px] text-faint">Measure the piece and enter both sides.</p>
      )}

      <Label>How many like this</Label>
      <div className="mb-4">
        <Stepper value={qty} onChange={setQty} />
      </div>

      <div className="mb-4.5 mb-2 rounded-lg bg-muted p-3 text-[13.5px]">
        These are saved as loose pieces with no parent sheet, so they will not appear inside a
        sheet diagram.
      </div>

      <Button size="lg" className="w-full" disabled={!bothValid || !clientInput.trim()} onClick={onAdd}>
        Add to stock
      </Button>
    </AppShell>
  )
}
