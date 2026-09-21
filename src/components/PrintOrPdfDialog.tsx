import { useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { IconLoader2, IconX } from '@tabler/icons-react'
import { Button } from './ui/button'
import { buildPrintPages } from '@/lib/print'
import { buildPrintPdf, pdfFileName } from '@/lib/pdf'
import { useData } from '@/store/data'
import { useSettings } from '@/store/settings'
import { useToast } from '@/store/toast'
import type { CutDoc } from '@/lib/types'

interface PrintOrPdfDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  cut: CutDoc
  /** Called instead of navigating internally, so each caller keeps its own current flow
   *  (Job detail navigates in place; Cut saved's Print button behaves exactly as before). */
  onPrint: () => void
}

/**
 * Shared "Print or save PDF" popup (bottom sheet under 768px, centred modal from 768px up)
 * used by both Job detail and Cut saved. "Print" keeps the existing /print/:jobId flow
 * completely untouched (delegates to `onPrint`). "Save as PDF" builds a real multi-page PDF
 * in-place with jsPDF (dynamically imported here, only on tap) and downloads it directly —
 * it never opens the print view or the browser print dialog.
 */
export function PrintOrPdfDialog({ open, onOpenChange, cut, onPrint }: PrintOrPdfDialogProps) {
  const derived = useData((s) => s.derived)
  const settings = useSettings((s) => s.settings)
  const toast = useToast((s) => s.show)
  const [saving, setSaving] = useState(false)

  async function saveAsPdf() {
    if (saving) return
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
      toast('PDF saved.')
      onOpenChange(false)
    } catch (err) {
      console.error(err)
      toast('Could not make the PDF. Try Print instead.')
    } finally {
      setSaving(false)
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

          <Button size="lg" className="mb-2.5 h-[52px] w-full" disabled={saving} onClick={saveAsPdf}>
            {saving && <IconLoader2 size={18} className="animate-spin" />}
            Save as PDF
          </Button>
          <Button variant="outline" className="h-12 w-full" onClick={onPrint}>
            Print
          </Button>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
