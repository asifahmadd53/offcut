import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { Stepper } from '@/components/Stepper'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { parseInches } from '@/lib/inches'
import { plural } from '@/lib/format'
import { saveCut } from '@/lib/db'
import { getDeviceId, uid } from '@/lib/id'
import { useAuth } from '@/store/auth'
import { useToast } from '@/store/toast'
import type { CutDoc, SheetPlan } from '@/lib/types'

export default function AddLeftover() {
  const navigate = useNavigate()
  const uidAuth = useAuth((s) => s.uid)
  const toast = useToast((s) => s.show)

  const [width, setWidth] = useState('')
  const [height, setHeight] = useState('')
  const [qty, setQty] = useState(1)
  const [touched, setTouched] = useState(false)
  const widthRef = useRef<HTMLInputElement>(null)

  const wVal = parseInches(width)
  const hVal = parseInches(height)
  const bothValid = wVal !== null && hVal !== null
  const looksNumeric = (s: string) => /^-?\d/.test(s.trim())
  const wZero = width.trim() !== '' && wVal === null && looksNumeric(width) && Number(width) <= 0
  const hZero = height.trim() !== '' && hVal === null && looksNumeric(height) && Number(height) <= 0
  const showErr = touched && (wVal === null || hVal === null) && (width.trim() !== '' || height.trim() !== '')

  function errMessage(): string {
    if (wZero) return 'Width must be more than 0. Try 23 or 22 1/2.'
    if (hZero) return 'Height must be more than 0. Try 23 or 22 1/2.'
    return 'That is not a size. Type a number like 23, 22.5 or 22 1/2.'
  }

  function onAdd() {
    setTouched(true)
    if (!bothValid || !uidAuth) return

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
    }
    saveCut(uidAuth, doc) // fire and forget, per R10
    toast(`${plural(qty, 'leftover')} added.`)
    navigate('/stock')
  }

  return (
    <AppShell title="Add leftover by hand" back="/stock">
      <p className="mb-4 text-[13px] text-muted-foreground">
        For offcuts already standing in your workshop.
      </p>

      <div className="mb-2.5 grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="aw">Width (in)</Label>
          <Input
            id="aw"
            ref={widthRef}
            inputMode="text"
            autoComplete="off"
            autoCapitalize="off"
            enterKeyHint="next"
            className="h-[42px] text-[18px]"
            value={width}
            onChange={(e) => setWidth(e.target.value)}
            onBlur={() => setTouched(true)}
          />
        </div>
        <div>
          <Label htmlFor="ah">Height (in)</Label>
          <Input
            id="ah"
            inputMode="text"
            autoComplete="off"
            autoCapitalize="off"
            enterKeyHint="done"
            className="h-[42px] text-[18px]"
            value={height}
            onChange={(e) => setHeight(e.target.value)}
            onBlur={() => setTouched(true)}
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

      <div className="mb-4.5 rounded-lg bg-muted p-3 text-[13.5px]">
        These are saved as loose pieces with no parent sheet, so they will not appear inside a
        sheet diagram.
      </div>

      <Button size="lg" className="h-14 w-full" disabled={!bothValid} onClick={onAdd}>
        Add to stock
      </Button>
    </AppShell>
  )
}
