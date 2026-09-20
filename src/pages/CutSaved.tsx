import { useLocation, useNavigate } from 'react-router-dom'
import { IconCheck } from '@tabler/icons-react'
import { plural } from '@/lib/format'

interface CutSavedState {
  cutId: string
  sheetCount: number
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

  if (!state) {
    navigate('/', { replace: true })
    return null
  }

  const { cutId, sheetCount } = state

  function printNow() {
    navigate(`/print/${cutId}`)
  }

  function saveAsPdf() {
    navigate(`/print/${cutId}`, { state: { hint: 'pdf' } })
  }

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
        onClick={printNow}
        className="mb-2.5 flex h-14 w-full items-center justify-center rounded-lg bg-primary text-[16px] font-semibold text-primary-foreground"
      >
        Print
      </button>
      <button
        type="button"
        onClick={saveAsPdf}
        className="mb-4 flex h-12 w-full items-center justify-center rounded-lg border-hair border-border-strong text-[15px] font-semibold text-foreground"
      >
        Save as PDF
      </button>
      <button type="button" onClick={() => navigate('/')} className="text-[14px] text-accent-text">
        Done
      </button>
    </div>
  )
}
