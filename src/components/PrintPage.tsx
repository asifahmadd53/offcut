import { SheetDiagram } from './SheetDiagram'
import type { PrintPage as PrintPageData } from '@/lib/print'

/** CSS pixel widths matching each page's printable inner content, after 12mm padding.
 *  At 96 CSS px/in: A4 (210mm) inner ~= 674px, Letter (8.5in) inner ~= 726px. Fixed so
 *  SheetDiagram's ResizeObserver settles on a stable, appropriately-sized pxPerInch. */
const DIAGRAM_W: Record<'A4' | 'Letter', number> = { A4: 674, Letter: 726 }

interface PrintPageProps {
  page: PrintPageData
  paperSize: 'A4' | 'Letter'
  isLast: boolean
}

/** One printed page: header, live SVG drawing (same SheetDiagram as screen, all cut lines
 *  shown), cut order, the same Sizes list as a table, and a footer. Reused for both the
 *  on-screen preview and the printed output — there is no separate rasterized rendering
 *  path (R-print: stays live SVG/HTML). */
export function PrintPage({ page, paperSize, isLast }: PrintPageProps) {
  return (
    <section
      className="print-page"
      style={{
        pageBreakAfter: isLast ? 'auto' : 'always',
        breakAfter: isLast ? 'auto' : 'page',
      }}
    >
      <header className="print-block mb-3 flex items-baseline justify-between">
        <div>
          <p className="mb-0 text-[15px] font-semibold">Offcut</p>
          <p className="mb-0 text-[13px]">{page.jobTitle}</p>
        </div>
        <div className="text-right text-[11px] text-muted-foreground">
          <p className="mb-0">{page.dateTimeText}</p>
          <p className="mb-0">
            Sheet {page.sheetIndex + 1} of {page.sheetTotal}
          </p>
        </div>
      </header>

      <div className="print-block mb-3 text-[11px] text-muted-foreground">
        <p className="mb-0">Sheet size {page.sheetSizeText}</p>
        <p className="mb-0">{page.sourceText}</p>
        <p className="mb-0">{page.bladeText}</p>
      </div>

      <div className="print-block mb-3" style={{ width: DIAGRAM_W[paperSize] }}>
        <SheetDiagram
          sheetW={page.sheet.sheetW}
          sheetH={page.sheet.sheetH}
          blocks={page.blocks}
          cuts={page.sheet.cuts}
          maxW={DIAGRAM_W[paperSize]}
          maxH={420}
          showAllCutLines
        />
      </div>

      <div className="print-block mb-3 text-[11px]">
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

      <div className="print-block mb-3 text-[11px]">
        <p className="mb-0.5 font-semibold">Parts</p>
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr>
              <th className="border-b border-border py-0.5 text-left font-semibold">Name</th>
              <th className="border-b border-border py-0.5 text-left font-semibold">Width</th>
              <th className="border-b border-border py-0.5 text-left font-semibold">Height</th>
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

      <footer className="print-block flex justify-between text-[10px] text-muted-foreground">
        <span>{page.footerLeft}</span>
        <span>
          Page {page.pageNumber} of {page.pageTotal}
        </span>
      </footer>
    </section>
  )
}
