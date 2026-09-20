import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { IconChevronLeft } from '@tabler/icons-react'
import { PrintPage } from '@/components/PrintPage'
import { buildPrintPages } from '@/lib/print'
import { useData } from '@/store/data'
import { useSettings } from '@/store/settings'

const PAGE_MM: Record<'A4' | 'Letter', { w: string; h: string }> = {
  A4: { w: '210mm', h: '297mm' },
  Letter: { w: '8.5in', h: '11in' },
}

/**
 * Print preview + print route. Deliberately does NOT use AppShell: printing needs a
 * minimal shell (a print-hidden top bar, nothing else) rather than the tab bar / sticky
 * bar machinery AppShell provides for the normal app. Fully offline: everything here
 * comes from useData()'s local Firestore cache, no network calls.
 */
export default function Print() {
  const { jobId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const derived = useData((s) => s.derived)
  const settings = useSettings((s) => s.settings)

  const job = derived.jobs.find((j) => j.cut.id === jobId)
  const hint = (location.state as { hint?: string } | null)?.hint === 'pdf'

  if (!job) {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col px-4 pt-4">
        <p className="mt-8 text-center text-[15px] text-muted-foreground">This job could not be found.</p>
        <button type="button" onClick={() => navigate('/')} className="mt-3 text-center text-[14px] text-accent-text">
          Back home
        </button>
      </div>
    )
  }

  const pages = buildPrintPages(job.cut, derived, settings)
  const size = PAGE_MM[settings.paperSize]

  return (
    <div className="min-h-dvh bg-muted">
      <style>{`
        @page { size: ${settings.paperSize === 'A4' ? 'A4' : 'letter'}; margin: 0; }
        @media print {
          .no-print { display: none !important; }
          html, body { background: #fff !important; }
          .print-page {
            width: ${size.w};
            height: ${size.h};
            padding: 12mm;
            box-shadow: none !important;
            margin: 0 !important;
            overflow: hidden;
          }
          .print-block { break-inside: avoid; }
          * { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        }
        @media screen {
          .print-page {
            width: ${size.w};
            height: ${size.h};
            padding: 12mm;
            background: white;
            color: #1f1e1c;
            box-shadow: 0 1px 4px rgba(0,0,0,0.15);
            margin: 0 auto 24px auto;
            overflow: hidden;
          }
        }
      `}</style>

      <div className="no-print sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-hair border-border bg-background px-4 py-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Back"
          className="flex h-10 w-10 items-center justify-center rounded-lg text-foreground"
        >
          <IconChevronLeft size={22} />
        </button>
        <p className="flex-1 truncate text-[15px] font-semibold">Print</p>
        <button
          type="button"
          onClick={() => window.print()}
          className="flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-[14px] font-semibold text-primary-foreground"
        >
          Print
        </button>
      </div>

      {hint && (
        <p className="no-print px-4 pt-3 text-center text-[13px] text-muted-foreground">
          Choose Save as PDF in the print window
        </p>
      )}
      <p className="no-print px-4 pb-2 pt-3 text-center text-[12.5px] text-faint">
        On a computer, the print window lets you choose your printer.
      </p>

      <div className="overflow-x-auto px-4 pb-8 pt-2">
        {pages.map((page, i) => (
          <PrintPage key={page.sheet.sheetId + i} page={page} isLast={i === pages.length - 1} />
        ))}
      </div>
    </div>
  )
}
