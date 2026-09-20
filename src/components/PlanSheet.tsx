import { dayMonth } from '@/lib/format'
import { fmtLeft } from '@/lib/inches'
import { SheetDiagram } from './SheetDiagram'
import type { Block } from '@/lib/sheetView'
import type { SheetPlan } from '@/lib/types'

interface PlanSheetProps {
  sheet: SheetPlan
  blocks: Block[]
}

/** One physical sheet of a plan: the diagram, a side panel, and the cut order below. */
export function PlanSheet({ sheet, blocks }: PlanSheetProps) {
  const usedArea = sheet.placements.reduce((sum, p) => sum + p.w * p.h, 0)
  const regionArea = sheet.region.w * sheet.region.h
  const pct = regionArea > 0 ? Math.round((usedArea / regionArea) * 100) : 0
  const anyTurned = sheet.placements.some((p) => p.rotated)
  const hasEarlier = blocks.some((b) => b.kind === 'earlier')

  return (
    <div>
      <div className="mb-3.5 flex items-start gap-6">
        <SheetDiagram sheetW={sheet.sheetW} sheetH={sheet.sheetH} blocks={blocks} />

        {sheet.isNew ? (
          <div className="min-w-0 flex-1 text-[13px]">
            <div className="mb-3 flex flex-col gap-1.5">
              <Legend swatch="cut" label="Cut pieces" />
              <Legend swatch="free" label="Saved leftover" />
            </div>
            <p className="mb-0.5 text-muted-foreground">Sheet used</p>
            <p className="mb-2.5 font-sans text-[22px] font-semibold">{pct}%</p>
            <p className="mb-0.5 text-muted-foreground">Leftovers</p>
            {sheet.newLeftovers.length === 0 ? (
              <p>None</p>
            ) : (
              sheet.newLeftovers.map((l) => (
                <p key={l.id}>
                  {l.letter}: {fmtLeft(l.w, l.h)}
                </p>
              ))
            )}
          </div>
        ) : (
          <div className="min-w-0 flex-1 text-[13px]">
            <p className="mb-0.5 text-muted-foreground">Use this leftover</p>
            <p className="mb-0.5 text-[16px] font-semibold">
              {sheet.usedLetter} · {fmtLeft(sheet.region.w, sheet.region.h)}
            </p>
            <p className="mb-3 text-muted-foreground">
              From the sheet cut on {dayMonth(sheet.sheetDate)}
            </p>
            <div className="flex flex-col gap-1.5">
              {hasEarlier && <Legend swatch="old" label="Already cut" />}
              <Legend swatch="cut" label="New piece" />
              <Legend swatch="free" label="Free after this cut" />
            </div>
            {anyTurned && (
              <span className="mt-2 inline-block rounded-full bg-muted px-2.5 py-0.5 text-[12px] text-muted-foreground">
                Turned to fit
              </span>
            )}
          </div>
        )}
      </div>

      <div className="mb-3.5 rounded-lg bg-muted p-3 text-[13px]">
        <p className="mb-0.5 text-muted-foreground">Cut order</p>
        {sheet.steps.length === 0 ? (
          <p>Nothing to cut on this sheet.</p>
        ) : (
          sheet.steps.map((s, i) => (
            <div key={i}>
              {i + 1}. {s}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function Legend({ swatch, label }: { swatch: 'cut' | 'free' | 'old'; label: string }) {
  const cls =
    swatch === 'cut'
      ? 'border-hair border-accent-border bg-accent-bg'
      : swatch === 'free'
        ? 'border border-dashed border-success-border bg-success-bg'
        : 'border-hair border-border bg-muted'
  return (
    <div className="flex items-center gap-2">
      <span className={`h-3.5 w-3.5 flex-none box-border ${cls}`} />
      {label}
    </div>
  )
}
