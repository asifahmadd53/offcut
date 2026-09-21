import { useLocation, useNavigate } from 'react-router-dom'
import { PrintOrPdfDialog } from '@/components/PrintOrPdfDialog'
import type { CutDoc } from '@/lib/types'

interface CutSavedState {
  /** The full record Plan.tsx just saved (fire-and-forget, per R10) — passed directly
   *  rather than looked up again, so this screen never has to wait on or race the
   *  Firestore write actually reaching the local cache. */
  cut: Omit<CutDoc, 'syncedAt'>
}

/**
 * Reached via navigate('/cut-saved', { state }) right after Confirm cut, when
 * settings.showPrintAfterConfirm is true. There is no separate "Cut saved" screen behind
 * the dialog any more — this route's only job is to open the shared Print-or-PDF popup
 * immediately, on a transparent page, and go Home the moment it closes (X, backdrop, a
 * successful PDF save, or choosing Print). Uses router location state rather than a store
 * field or a URL param, since nothing about a just-confirmed cut needs to persist beyond
 * this one transient hand-off (this app's BrowserRouter has no data loaders, so location
 * state is the idiomatic way to hand this route its one-shot summary here).
 */
export default function CutSaved() {
  const navigate = useNavigate()
  const location = useLocation()
  const state = location.state as CutSavedState | null

  if (!state) {
    navigate('/', { replace: true })
    return null
  }

  const { cut } = state
  const cutDoc: CutDoc = { ...cut, syncedAt: null }

  return (
    <PrintOrPdfDialog
      open
      onOpenChange={(open) => {
        if (!open) navigate('/', { replace: true })
      }}
      cut={cutDoc}
      onPrint={() => navigate(`/print/${cutDoc.id}`, { replace: true })}
    />
  )
}
