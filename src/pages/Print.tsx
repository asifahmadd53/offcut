import { useEffect, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { IconChevronLeft } from '@tabler/icons-react'
import { buildPrintSvgPages } from '@/lib/pdf'
import { buildPrintPages } from '@/lib/print'
import { useData } from '@/store/data'
import { useSettings } from '@/store/settings'

const PAGE_MM: Record<'A4' | 'Letter', { w: string; h: string }> = {
  A4: { w: '210mm', h: '297mm' },
  Letter: { w: '215.9mm', h: '279.4mm' },
}

/**
 * Print preview + print route. Deliberately does NOT use AppShell: printing needs a
 * minimal shell (a print-hidden top bar, nothing else) rather than the tab bar / sticky
 * bar machinery AppShell provides for the normal app. Fully offline: everything here
 * comes from useData()'s local Firestore cache, no network calls.
 *
 * The pages are not a separate layout: they are the saved PDF's own pages, drawn by the
 * same code (lib/pdf.ts) as SVG, so printing and Save as PDF always give the same document.
 */
export default function Print() {
  const { jobId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const derived = useData((s) => s.derived)
  const settings = useSettings((s) => s.settings)
  const [svgPages, setSvgPages] = useState<string[] | null>(null)

  const job = derived.jobs.find((j) => j.cut.id === jobId)
  const hint = (location.state as { hint?: string } | null)?.hint === 'pdf'

  useEffect(() => {
    if (!job) return
    let cancelled = false
    ;(async () => {
      // jsPDF is only needed for its text measuring; it is the same chunk Save as PDF loads.
      const { jsPDF } = await import('jspdf')
      const pages = buildPrintPages(job.cut, derived, settings)
      const out = buildPrintSvgPages(pages, settings.paperSize, jsPDF, job.cut)
      if (!cancelled) setSvgPages(out)
    })().catch((err) => console.error(err))
    return () => {
      cancelled = true
    }
  }, [job, derived, settings])

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

  const size = PAGE_MM[settings.paperSize]

  return (
    <div className="print-root min-h-dvh bg-muted">
      <style>{`
        @page { size: ${settings.paperSize === 'A4' ? 'A4' : 'letter'}; margin: 0; }
        .print-page svg { display: block; width: 100%; height: auto; }
        @media print {
          .no-print { display: none !important; }
          html, body { background: #fff !important; }
          .print-root { min-height: 0 !important; background: #fff !important; }
          .print-wrap { padding: 0 !important; }
          .print-page {
            width: ${size.w};
            height: ${size.h};
            margin: 0 !important;
            box-shadow: none !important;
            overflow: hidden;
          }
          .print-page:not(:last-child) { break-after: page; page-break-after: always; }
          * { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        }
        @media screen {
          .print-page {
            width: min(100%, ${size.w});
            background: #fff;
            box-shadow: 0 1px 4px rgba(0,0,0,0.15);
            margin: 0 auto 24px auto;
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
          disabled={!svgPages}
          onClick={() => window.print()}
          className="flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-[14px] font-semibold text-primary-foreground disabled:opacity-50"
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

      <div className="print-wrap px-4 pb-8 pt-2">
        {!svgPages && <p className="no-print py-10 text-center text-[14px] text-muted-foreground">Getting your pages ready…</p>}
        {svgPages?.map((svg, i) => (
          // The SVG is built from this job's own data with every text escaped (SvgDoc).
          <div key={i} className="print-page" dangerouslySetInnerHTML={{ __html: svg }} />
        ))}
      </div>
    </div>
  )
}
