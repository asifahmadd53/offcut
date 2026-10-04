import { useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { IconLoader2, IconShare2, IconX } from '@tabler/icons-react'
import { Button } from './ui/button'
import { buildPrintPages } from '@/lib/print'
import { buildPrintPdf, pdfFileName } from '@/lib/pdf'
import { useData } from '@/store/data'
import { useSettings } from '@/store/settings'
import { toast } from 'sonner'
import type { CutDoc } from '@/lib/types'

interface PrintOrPdfDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  cut: CutDoc
  /** Called instead of navigating internally, so each caller keeps its own current flow
   *  (Job detail navigates in place; Cut saved's Print button behaves exactly as before). */
  onPrint: () => void
  /** What the Done link does. Defaults to just closing the popup (Job detail); Cut saved
   *  passes its own so Done can leave for Home while X still keeps the user in place. */
  onDone?: () => void
  /** Called when Save as PDF is tapped, before the PDF is built (Plan saves the cut here). */
  onBeforeSave?: () => void
}

/**
 * Shared "Print or save PDF" popup (bottom sheet under 768px, centred modal from 768px up)
 * used by both Job detail and Cut saved. "Print" keeps the existing /print/:jobId flow
 * completely untouched (delegates to `onPrint`). "Save as PDF" builds a real multi-page PDF
 * in-place with jsPDF (dynamically imported here, only on tap) and downloads it directly —
 * it never opens the print view or the browser print dialog.
 */
export function PrintOrPdfDialog({ open, onOpenChange, cut, onPrint, onDone, onBeforeSave }: PrintOrPdfDialogProps) {
  const derived = useData((s) => s.derived)
  const settings = useSettings((s) => s.settings)
  const [saving, setSaving] = useState(false)
  const [sharing, setSharing] = useState(false)

  async function saveAsPdf() {
    if (saving) return
    onBeforeSave?.()
    setSaving(true)
    try {
      const pages = buildPrintPages(cut, derived, settings)
      const { jsPDF } = await import('jspdf')
      const blob = await buildPrintPdf(pages, settings.paperSize, jsPDF)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = pdfFileName(cut)
      a.click()
      URL.revokeObjectURL(url)
      toast.success('PDF saved.')
      onOpenChange(false)
    } catch (err) {
      console.error(err)
      toast.error('Could not make the PDF. Try Print instead.')
    } finally {
      setSaving(false)
    }
  }

  // Same PDF as Save as PDF, handed to the phone's share sheet (WhatsApp, email…). Where the
  // device cannot share files (most laptops) it is downloaded instead, so Share never dead-ends.
  async function sharePdf() {
    if (sharing || saving) return
    onBeforeSave?.()
    setSharing(true)
    try {
      const pages = buildPrintPages(cut, derived, settings)
      const { jsPDF } = await import('jspdf')
      const blob = await buildPrintPdf(pages, settings.paperSize, jsPDF)
      const name = pdfFileName(cut)
      const file = new File([blob], name, { type: 'application/pdf' })
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: name })
      } else {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = name
        a.click()
        URL.revokeObjectURL(url)
        toast('Sharing is not available here. PDF saved instead.')
      }
      onOpenChange(false)
    } catch (err) {
      // Closing the share sheet without choosing anyone is not a failure.
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        console.error(err)
        toast.error('Could not share the PDF. Try Save as PDF instead.')
      }
    } finally {
      setSharing(false)
    }
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <DialogPrimitive.Content
          className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border-hair border-border bg-background p-5 pb-[calc(env(safe-area-inset-bottom)+20px)] text-foreground focus-visible:outline-none sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[calc(100%-32px)] sm:max-w-[400px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:pb-5"
        >
          <div className="mb-3 flex items-center justify-between">
            <DialogPrimitive.Title className="text-[18px] font-semibold">
              Print or save PDF
            </DialogPrimitive.Title>
            <DialogPrimitive.Close asChild>
              <button
                type="button"
                aria-label="Close"
                className="flex h-9 w-9 flex-none items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
              >
                <IconX size={18} />
              </button>
            </DialogPrimitive.Close>
          </div>

          <Button size="lg" className="mb-2.5 w-full" disabled={saving || sharing} onClick={saveAsPdf}>
            {saving && <IconLoader2 size={18} className="animate-spin" />}
            Save as PDF
          </Button>
          <Button variant="outline" size="lg" className="mb-2.5  w-full" onClick={onPrint}>
            Print
          </Button>
          <Button variant="outline" size="lg" className="mb-2.5 w-full" disabled={sharing || saving} onClick={sharePdf}>
            {sharing ? <IconLoader2 size={18} className="animate-spin" /> : <IconShare2 size={18} />}
            Share
          </Button>
          <button
            type="button"
            onClick={onDone ?? (() => onOpenChange(false))}
            className="block w-full text-center text-[14px] text-accent-text"
          >
            Done
          </button>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
