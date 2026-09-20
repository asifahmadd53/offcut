import { SheetDiagram } from './SheetDiagram'
import type { PrintPage as PrintPageData } from '@/lib/print'

interface PrintPageProps {
  page: PrintPageData
  isLast: boolean
}

/** One printed page: the live SVG drawing (same SheetDiagram as screen) fills almost the
 *  whole page on the left, with the header, sheet info, cut order, parts table and footer
 *  in a narrow column on the right — mirroring the on-screen Job detail layout (diagram +
 *  side panel) rather than stacking everything in one column. Reused for both the
 *  on-screen preview and the printed output — no separate rasterized rendering path
 *  (R-print: stays live SVG/HTML). */
export function PrintPage({ page, isLast }: PrintPageProps) {
  return (
    <section
      className="print-page flex gap-4"
      style={{
        pageBreakAfter: isLast ? 'auto' : 'always',
        breakAfter: isLast ? 'auto' : 'page',
      }}
    >
      <div className="print-block min-h-0 min-w-0 flex-1">
        <SheetDiagram
          sheetW={page.sheet.sheetW}
          sheetH={page.sheet.sheetH}
          blocks={page.blocks}
          cuts={page.sheet.cuts}
          fill
        />
      </div>

      <aside className="flex w-[190px] flex-none flex-col text-[11px]">
        <header className="print-block mb-3">
          <p className="mb-0 text-[15px] font-semibold">Offcut</p>
          <p className="mb-0 text-[13px]">{page.jobTitle}</p>
          <p className="mb-0 mt-1.5 text-muted-foreground">{page.dateTimeText}</p>
          <p className="mb-0 text-muted-foreground">
            Sheet {page.sheetIndex + 1} of {page.sheetTotal}
          </p>
        </header>

        <div className="print-block mb-3 text-muted-foreground">
          <p className="mb-0">Sheet size {page.sheetSizeText}</p>
          <p className="mb-0">{page.sourceText}</p>
          <p className="mb-0">{page.bladeText}</p>
        </div>

        <div className="print-block mb-3">
          <p className="mb-0.5 font-semibold">Cut order</p>
          {page.cutOrder.length === 0 ? (
            <p className="mb-0">Nothing to cut on this sheet.</p>
          ) : (
            page.cutOrder.map((s, i) => (
              <p key={i} className="mb-0">
                {i + 1}. {s}
              </p>
            ))
          )}
        </div>

        <div className="print-block mb-3">
          <p className="mb-0.5 font-semibold">Parts</p>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="border-b border-border py-0.5 text-left font-semibold">Name</th>
                <th className="border-b border-border py-0.5 text-left font-semibold">W</th>
                <th className="border-b border-border py-0.5 text-left font-semibold">H</th>
                <th className="border-b border-border py-0.5 text-left font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {page.parts.map((row, i) => (
                <tr key={i}>
                  <td className="py-0.5">{row.label}</td>
                  <td className="py-0.5">{row.width}</td>
                  <td className="py-0.5">{row.height}</td>
                  <td className="py-0.5">{row.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <footer className="print-block mt-auto text-[10px] text-muted-foreground">
          <p className="mb-0">{page.footerLeft}</p>
          <p className="mb-0">
            Page {page.pageNumber} of {page.pageTotal}
          </p>
        </footer>
      </aside>
    </section>
  )
}
