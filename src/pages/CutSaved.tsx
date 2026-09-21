import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { IconCheck } from '@tabler/icons-react'
import { PrintOrPdfDialog } from '@/components/PrintOrPdfDialog'
import { plural } from '@/lib/format'
import type { CutDoc } from '@/lib/types'

interface CutSavedState {
  /** The full record Plan.tsx just saved (fire-and-forget, per R10) — passed directly
   *  rather than looked up again, so this screen never has to wait on or race the
   *  Firestore write actually reaching the local cache. */
  cut: Omit<CutDoc, 'syncedAt'>
}

/**
 * Reached via navigate('/cut-saved', { state }) right after Confirm cut, when
 * settings.showPrintAfterConfirm is true. Uses router location state rather than a
 * store field or a URL param, since nothing about a just-confirmed cut needs to persist
 * beyond this one transient screen (this app's BrowserRouter has no data loaders, so
 * location state is the idiomatic way to hand a screen its one-shot summary here).
 */
export default function CutSaved() {
  const navigate = useNavigate()
  const location = useLocation()
  const state = location.state as CutSavedState | null
  const [printOpen, setPrintOpen] = useState(false)

  if (!state) {
    navigate('/', { replace: true })
    return null
  }

  const { cut } = state
  const sheetCount = cut.sheets.length
  const cutDoc: CutDoc = { ...cut, syncedAt: null }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-success-bg text-success-text">
        <IconCheck size={30} />
      </div>
      <p className="mb-1 text-[20px] font-semibold">Cut saved</p>
      <p className="mb-6 text-[14px] text-muted-foreground">
        {plural(sheetCount, 'sheet')} · {plural(sheetCount, 'page')}
      </p>

      <button
        type="button"
        onClick={() => setPrintOpen(true)}
        className="mb-4 flex h-14 w-full items-center justify-center rounded-lg bg-primary text-[16px] font-semibold text-primary-foreground"
      >
        Print or save PDF
      </button>
      <button type="button" onClick={() => navigate('/')} className="text-[14px] text-accent-text">
        Done
      </button>

      <PrintOrPdfDialog
        open={printOpen}
        onOpenChange={setPrintOpen}
        cut={cutDoc}
        onPrint={() => navigate(`/print/${cutDoc.id}`)}
      />
    </div>
  )
}
