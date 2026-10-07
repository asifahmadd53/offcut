import { useRef, useState } from 'react'
import { TransformComponent, TransformWrapper, type ReactZoomPanPinchRef } from 'react-zoom-pan-pinch'
import { IconX } from '@tabler/icons-react'
import { dayMonth } from '@/lib/format'
import { sizeFormatter, type SizeStyle } from '@/lib/inches'
import { tapeSummary, tapeTotalText } from '@/lib/tape'
import { dgLightDeclarations } from '@/lib/diagramStyle'
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
  /** Fractions or decimals for the sizes the app works out itself; follows how the job was typed. */
  sizeStyle?: SizeStyle
}

/** One physical sheet of a plan: the diagram, a side panel, and the cut order below. */
export function PlanSheet({ sheet, blocks, highlightIndex, sizeStyle = 'decimal' }: PlanSheetProps) {
  const F = sizeFormatter(sizeStyle)
  const usedArea = sheet.placements.reduce((sum, p) => sum + p.w * p.h, 0)
  const regionArea = sheet.region.w * sheet.region.h
  const pct = regionArea > 0 ? Math.round((usedArea / regionArea) * 100) : 0
  const anyTurned = sheet.placements.some((p) => p.rotated)
  const hasEarlier = blocks.some((b) => b.kind === 'earlier')

  const pieces = blocks.filter((b) => b.kind === 'cut').sort((p, q) => (p.n ?? 0) - (q.n ?? 0))
  const tape = tapeSummary(pieces.map((b) => ({ n: b.n ?? 0, w: b.w, h: b.h, tape: b.tape })))

  const [fullScreen, setFullScreen] = useState(false)

  return (
    <div>
      <div className="mb-3.5 flex flex-col items-start gap-4 lg:flex-row lg:items-start lg:gap-6">
        <div
          data-plan-sheet-svg={sheet.sheetId}
          className="w-full min-w-0 lg:flex-1"
        >
          <SheetDiagram
            sheetW={sheet.sheetW}
            sheetH={sheet.sheetH}
            blocks={blocks}
            cuts={sheet.cuts}
            highlightIndex={highlightIndex}
            sizeStyle={sizeStyle}
            autoHeight
          />
        </div>

        <div className="min-w-0 w-full lg:w-64 lg:flex-none text-[13px]">
          {!sheet.isNew && (
            <>
              <p className="mb-0.5 text-muted-foreground">Use this leftover</p>
              <p className="mb-0.5 text-[16px] font-semibold">
                {sheet.usedLetter} · {F.fmtLeft(sheet.region.w, sheet.region.h)}
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
            <Legend swatch="path" label="Cut line" />
            {tape.rows.length > 0 && <Legend swatch="tape" label="Tape" />}
          </div>
          <p className="mb-3 text-[12px] text-muted-foreground">Sizes are width × height, in inches</p>
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

          {tape.total > 0 && (
            <p className="mb-0 mt-3 flex justify-between gap-3">
              <span className="text-muted-foreground">Edge tape used</span>
              <span className="font-semibold">{tapeTotalText(tape.total, F.fmt)}</span>
            </p>
          )}

          {pieces.length > 0 && (
            <>
              <p className="mb-1 mt-3 flex justify-between gap-3 text-muted-foreground">
                <span>Cutting pieces ({pieces.length})</span>
                <span className="text-[12px]">width × height</span>
              </p>
              {pieces.map((b) => (
                <p key={b.n} className="mb-0 flex justify-between gap-3">
                  <span className="font-semibold">
                    Piece {b.n}
                    {b.rotated ? ' (turned)' : ''}
                  </span>
                  <span>{b.label ?? F.fmtDims(b.w, b.h)}</span>
                </p>
              ))}
            </>
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

      <div className="mb-3.5 rounded-lg bg-muted p-3 text-[13px]">
        <p className="mb-0.5 text-muted-foreground">Saved to stock</p>
        {sheet.newLeftovers.length === 0 ? (
          <p className="mb-0">None</p>
        ) : (
          sheet.newLeftovers.map((l) => (
            <p key={l.id} className="mb-0">
              {l.letter}: {F.fmtLeft(l.w, l.h)}
            </p>
          ))
        )}
      </div>

      {tape.rows.length > 0 && (
        <div className="mb-3.5 rounded-lg bg-muted p-3 text-[13px]" style={{ borderLeft: '6px solid var(--dg-tape)' }}>
          <p className="mb-1 flex justify-between gap-3">
            <span className="text-[14px] font-bold">
              Edge tape ({tape.rows.length} {tape.rows.length === 1 ? 'piece' : 'pieces'})
            </span>
            <span className="font-semibold">total {tapeTotalText(tape.total, F.fmt)}</span>
          </p>
          {tape.rows.map((r) => (
            <p key={r.n} className="mb-0 flex justify-between gap-3">
              <span className="font-semibold">Piece {r.n}</span>
              <span>{r.lengths.map((n) => F.fmt(n)).join(' + ')}</span>
            </p>
          ))}
        </div>
      )}

      <Dialog open={fullScreen} onOpenChange={setFullScreen}>
        <DialogContent className="h-[100dvh] max-h-[100dvh] w-[100vw] max-w-[100vw] rounded-none">
          <DialogTitle className="sr-only">Sheet diagram, full screen</DialogTitle>
          <FullScreenDiagram
            sheet={sheet}
            blocks={blocks}
            sizeStyle={sizeStyle}
            onClose={() => setFullScreen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}

function FullScreenDiagram({ sheet, blocks, sizeStyle, onClose }: { sheet: SheetPlan; blocks: Block[]; sizeStyle: SizeStyle; onClose: () => void }) {
  const wrapperRef = useRef<ReactZoomPanPinchRef | null>(null)
  const [zoomed, setZoomed] = useState(false)

  return (
    <div className="flex h-full w-full flex-col">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close full screen"
          className="flex h-11 items-center gap-1.5 self-start rounded-lg border-hair border-border px-3 text-[13px] font-semibold"
        >
          <IconX size={18} />
          Close
        </button>
        {zoomed && (
          <button
            type="button"
            onClick={() => wrapperRef.current?.resetTransform()}
            className="h-11 self-start rounded-lg border-hair border-border px-3 text-[13px] font-semibold"
          >
            Reset zoom
          </button>
        )}
      </div>
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
              cuts={sheet.cuts}
              sizeStyle={sizeStyle}
              fill
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

      // The live SVG's fills/strokes reference var(--token) custom properties, which only
      // resolve against the page's own stylesheet — a cloned SVG serialized to a standalone
      // blob and loaded as a plain <img> has no such stylesheet, so every var(...) silently
      // computes to nothing and paints black. Same fix as the print page (CLAUDE.md C29):
      // pin every token this diagram actually uses to its light-mode hex value directly on
      // the clone, regardless of the device's dark-mode setting, since the saved image (like
      // paper) is always meant to read on a light background.
      const style = document.createElementNS('http://www.w3.org/2000/svg', 'style')
      style.textContent = `
        svg {
          --background: #f6f3ee;
          --muted: #ece8e0;
          --muted-foreground: #5f5a50;
          --faint: #736d62;
          --border: #e8e2d8;
          --border-strong: #8f8270;
          --border-stronger: #736853;
          --accent-bg: #dbeafe;
          --accent-border: #60a5fa;
          --accent-text: #1e3a8a;
          --success-bg: #dcfce7;
          --success-border: #16a34a;
          --success-text: #14532d;
          ${dgLightDeclarations()}
        }
      `
      clone.insertBefore(style, clone.firstChild)

      const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
      bg.setAttribute('x', '0')
      bg.setAttribute('y', '0')
      bg.setAttribute('width', String(w))
      bg.setAttribute('height', String(h))
      bg.setAttribute('fill', '#f6f3ee')
      clone.insertBefore(bg, style.nextSibling)

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

function Legend({ swatch, label }: { swatch: 'cut' | 'free' | 'old' | 'path' | 'tape' | 'turn'; label: string }) {
  if (swatch === 'turn') {
    return (
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="flex h-3.5 w-3.5 flex-none items-center justify-center text-[14px] font-bold leading-none">
          ↻
        </span>
        {label}
      </div>
    )
  }
  if (swatch === 'tape') {
    return (
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="flex h-3.5 w-3.5 flex-none items-center justify-center rounded-sm" style={{ background: 'var(--dg-tape)' }}>
          <span className="h-0 w-2.5 border-t-2 border-dotted" style={{ borderColor: 'var(--dg-tape-ink)' }} />
        </span>
        {label}
      </div>
    )
  }
  if (swatch === 'path') {
    return (
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="h-0 w-3.5 flex-none border-t-2 border-dashed"
          style={{ borderColor: 'var(--dg-orange)' }}
        />
        {label}
      </div>
    )
  }
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
