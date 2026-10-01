import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { PrintOrPdfDialog } from '@/components/PrintOrPdfDialog'
import JobDetail from '@/pages/JobDetail'
import type { CutDoc } from '@/lib/types'

interface CutSavedState {
  /** The full record Plan.tsx just saved (fire-and-forget, per R10) — passed directly
   *  rather than looked up again, so this screen never has to wait on or race the
   *  Firestore write actually reaching the local cache. */
  cut: Omit<CutDoc, 'syncedAt'>
}

/**
 * Reached via navigate('/cut-saved', { state }) right after every Confirm cut. The cut is
 * already saved by then (Plan saves first, per R10); this route only offers the shared
 * Print-or-PDF popup. The job's own Job detail page is drawn behind the popup so the
 * backdrop sits over real content, and closing the popup (X, backdrop, a successful PDF
 * save) just dismisses it — it never navigates, so the user stays on this page. Done goes
 * Home and Print goes to the print view (both replace this entry in the history). Router location state (not a store field) carries the
 * one-shot cut, since nothing about it needs to outlive this hand-off.
 */
export default function CutSaved() {
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(true)
  const state = location.state as CutSavedState | null

  if (!state) {
    navigate('/', { replace: true })
    return null
  }

  const { cut } = state
  const cutDoc: CutDoc = { ...cut, syncedAt: null }

  return (
    <>
      <JobDetail id={cutDoc.id} fallbackCut={cutDoc} />
      <PrintOrPdfDialog
        open={open}
        onOpenChange={setOpen}
        cut={cutDoc}
        onPrint={() => navigate(`/print/${cutDoc.id}`, { replace: true })}
        onDone={() => navigate('/', { replace: true })}
      />
    </>
  )
}
