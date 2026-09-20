import { useRef, useState } from 'react'
import { TransformComponent, TransformWrapper, type ReactZoomPanPinchRef } from 'react-zoom-pan-pinch'
import { dayMonth } from '@/lib/format'
import { fmtLeft } from '@/lib/inches'
import { badgedLeftovers } from '@/lib/labelChoice'
import { SheetDiagram } from './SheetDiagram'
import { Dialog, DialogContent, DialogTitle } from './ui/dialog'
import type { Block } from '@/lib/sheetView'
import type { SheetPlan } from '@/lib/types'

interface PlanSheetProps {
  sheet: SheetPlan
  blocks: Block[]
  /** Index into `blocks` of the one block to draw with a solid highlight border, e.g. the
   *  leftover Leftover detail opened. Purely a rendering overlay (SheetDiagram's own
   *  highlightIndex prop) — never changes geometry, scale, or any label. */
  highlightIndex?: number
}

const DIAGRAM_MAX_W = 144
const DIAGRAM_MAX_H = 288

/** One physical sheet of a plan: the diagram, a side panel, and the cut order below. */
export function PlanSheet({ sheet, blocks, highlightIndex }: PlanSheetProps) {
  const usedArea = sheet.placements.reduce((sum, p) => sum + p.w * p.h, 0)
  const regionArea = sheet.region.w * sheet.region.h
  const pct = regionArea > 0 ? Math.round((usedArea / regionArea) * 100) : 0
  const anyTurned = sheet.placements.some((p) => p.rotated)
  const hasEarlier = blocks.some((b) => b.kind === 'earlier')

  // Blocks too small to carry their own label still owe their size to the legend (R15).
  const scale = Math.min(DIAGRAM_MAX_W / sheet.sheetW, DIAGRAM_MAX_H / sheet.sheetH)
  const badged = badgedLeftovers(blocks, scale)

  const [activeCut, setActiveCut] = useState<number | null>(null)
  const [fullScreen, setFullScreen] = useState(false)

  function toggleCut(n: number) {
    setActiveCut((cur) => (cur === n ? null : n))
  }

  return (
    <div>
      <div className="mb-3.5 flex flex-col items-start gap-4 lg:flex-row lg:items-start lg:gap-6">
        <div
          data-plan-sheet-svg={sheet.sheetId}
          className="h-[60vh] min-h-[320px] w-full lg:h-[70vh] lg:min-h-[480px] lg:flex-1"
        >
          <SheetDiagram
            sheetW={sheet.sheetW}
            sheetH={sheet.sheetH}
            blocks={blocks}
            cuts={sheet.cuts}
            activeCut={activeCut}
            onCutToggle={toggleCut}
            highlightIndex={highlightIndex}
            fill
          />
        </div>

        <div className="min-w-0 w-full lg:w-64 lg:flex-none text-[13px]">
          {!sheet.isNew && (
            <>
              <p className="mb-0.5 text-muted-foreground">Use this leftover</p>
              <p className="mb-0.5 text-[16px] font-semibold">
                {sheet.usedLetter} · {fmtLeft(sheet.region.w, sheet.region.h)}
              </p>
              <p className="mb-3 text-muted-foreground">
                From the sheet cut on {dayMonth(sheet.sheetDate)}
              </p>
            </>
          )}

          <div className="mb-3 flex flex-col gap-1.5">
            {hasEarlier && <Legend swatch="old" label="Already cut" />}
            <Legend swatch="cut" label={sheet.isNew ? 'Cut pieces' : 'New piece'} />
            <Legend swatch="free" label={sheet.isNew ? 'Saved leftover' : 'Free after this cut'} />
          </div>
          {anyTurned && (
            <span className="mb-3 mt-[-6px] inline-block rounded-full bg-muted px-2.5 py-0.5 text-[12px] text-muted-foreground">
              Turned to fit
            </span>
          )}

          <p className="mb-0.5 text-muted-foreground">Sheet used</p>
          <p className="mb-0.5 font-sans text-[22px] font-semibold">{pct}%</p>
          <p className="mb-3 text-muted-foreground">
            {Math.round(usedArea).toLocaleString()} of {Math.round(regionArea).toLocaleString()} sq in
          </p>

          <p className="mb-0.5 text-muted-foreground">Saved to stock</p>
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
      </div>

      <div className="mb-3.5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setFullScreen(true)}
          className="flex h-11 min-w-[44px] items-center justify-center rounded-lg border-hair border-border px-3 text-[13px] font-semibold text-foreground"
        >
          Full screen
        </button>
        <SaveImageButton sheet={sheet} blocks={blocks} />
      </div>

      {badged.length > 0 && (
        <div className="mb-3.5 rounded-lg bg-muted p-3 text-[13px]">
          {badged.map((b, i) => (
            <p key={i} className="mb-0 text-muted-foreground">
              {b.letter}: {b.dims}
            </p>
          ))}
        </div>
      )}

      <div className="mb-3.5 rounded-lg bg-muted p-3 text-[13px]">
        <p className="mb-0.5 text-muted-foreground">Cut order</p>
        {sheet.steps.length === 0 ? (
          <p>Nothing to cut on this sheet.</p>
        ) : (
          sheet.steps.map((s, i) => {
            const n = i + 1
            const active = activeCut === n
            const hasCutData = !!sheet.cuts?.[i]
            return (
              <div
                key={i}
                role={hasCutData ? 'button' : undefined}
                tabIndex={hasCutData ? 0 : undefined}
                aria-pressed={hasCutData ? active : undefined}
                onClick={hasCutData ? () => toggleCut(n) : undefined}
                onKeyDown={
                  hasCutData
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          toggleCut(n)
                        }
                      }
                    : undefined
                }
                className={
                  hasCutData
                    ? `min-h-[44px] cursor-pointer content-center rounded px-1 ${active ? 'bg-accent-bg font-semibold text-accent-text' : ''}`
                    : undefined
                }
              >
                {n}. {s}
              </div>
            )
          })
        )}
      </div>

      <Dialog open={fullScreen} onOpenChange={setFullScreen}>
        <DialogContent className="h-[100dvh] max-h-[100dvh] w-[100vw] max-w-[100vw] rounded-none">
          <DialogTitle className="sr-only">Sheet diagram, full screen</DialogTitle>
          <FullScreenDiagram sheet={sheet} blocks={blocks} activeCut={activeCut} onCutToggle={toggleCut} />
        </DialogContent>
      </Dialog>
    </div>
  )
}

function FullScreenDiagram({
  sheet,
  blocks,
  activeCut,
  onCutToggle,
}: {
  sheet: SheetPlan
  blocks: Block[]
  activeCut: number | null
  onCutToggle: (n: number) => void
}) {
  const wrapperRef = useRef<ReactZoomPanPinchRef | null>(null)
  const [zoomed, setZoomed] = useState(false)

  return (
    <div className="flex h-full w-full flex-col">
      {zoomed && (
        <button
          type="button"
          onClick={() => wrapperRef.current?.resetTransform()}
          className="mb-2 h-11 self-start rounded-lg border-hair border-border px-3 text-[13px] font-semibold"
        >
          Reset zoom
        </button>
      )}
      <div className="min-h-0 flex-1">
        <TransformWrapper
          ref={wrapperRef}
          onTransform={(ref) => setZoomed(ref.state.scale > 1.001)}
        >
          <TransformComponent wrapperStyle={{ width: '100%', height: '100%' }}>
            <SheetDiagram
              sheetW={sheet.sheetW}
              sheetH={sheet.sheetH}
              blocks={blocks}
              maxW={480}
              maxH={800}
              cuts={sheet.cuts}
              activeCut={activeCut}
              onCutToggle={onCutToggle}
            />
          </TransformComponent>
        </TransformWrapper>
      </div>
    </div>
  )
}

/**
 * Renders the diagram to a PNG (serialize SVG -> Image -> canvas) with a title line and a
 * simple legend, then shares it via navigator.share when available, else downloads it.
 * Works offline: no network calls. Best-effort, hard to verify headlessly.
 */
function SaveImageButton({ sheet }: { sheet: SheetPlan; blocks: Block[] }) {
  const [busy, setBusy] = useState(false)

  async function save() {
    if (busy) return
    setBusy(true)
    try {
      const svgEl = document.querySelector<SVGSVGElement>(`[data-plan-sheet-svg="${sheet.sheetId}"] svg`)
      if (!svgEl) return
      const clone = svgEl.cloneNode(true) as SVGSVGElement
      const vb = svgEl.viewBox.baseVal
      const pad = 28
      const w = vb.width
      const h = vb.height + pad

      clone.setAttribute('viewBox', `0 0 ${w} ${h}`)
      clone.setAttribute('width', String(w))
      clone.setAttribute('height', String(h))
      const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
      bg.setAttribute('x', '0')
      bg.setAttribute('y', '0')
      bg.setAttribute('width', String(w))
      bg.setAttribute('height', String(h))
      bg.setAttribute('fill', getComputedStyle(document.body).backgroundColor || '#ffffff')
      clone.insertBefore(bg, clone.firstChild)

      const title = document.createElementNS('http://www.w3.org/2000/svg', 'text')
      title.setAttribute('x', '8')
      title.setAttribute('y', String(h - 8))
      title.setAttribute('font-size', '12')
      title.setAttribute('fill', '#5f5e5a')
      const pieceSummary = sheet.placements.map((p) => p.label).join(', ') || 'No pieces'
      title.textContent = `${pieceSummary} — ${new Date().toLocaleDateString()} — sheet ${sheet.sheetW} × ${sheet.sheetH}`
      clone.appendChild(title)

      const svgText = new XMLSerializer().serializeToString(clone)
      const svgBlob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' })
      const url = URL.createObjectURL(svgBlob)

      const img = new Image()
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('image load failed'))
        img.src = url
      })

      const scale = 2
      const canvas = document.createElement('canvas')
      canvas.width = w * scale
      canvas.height = h * scale
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.scale(scale, scale)
      ctx.drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(url)

      canvas.toBlob(async (blob) => {
        if (!blob) return
        const fileName = `sheet-${sheet.sheetW}x${sheet.sheetH}-${Date.now()}.png`
        const file = new File([blob], fileName, { type: 'image/png' })
        if (navigator.share && navigator.canShare?.({ files: [file] })) {
          try {
            await navigator.share({ files: [file], title: 'Cutting plan' })
            return
          } catch {
            // fall through to download
          }
        }
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = fileName
        a.click()
        URL.revokeObjectURL(a.href)
      }, 'image/png')
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={save}
      disabled={busy}
      data-plan-sheet-svg-trigger
      className="flex h-11 min-w-[44px] items-center justify-center rounded-lg border-hair border-border px-3 text-[13px] font-semibold text-foreground disabled:opacity-60"
    >
      Save image
    </button>
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
