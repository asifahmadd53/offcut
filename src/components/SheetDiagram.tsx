import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { diagramAriaLabel } from '@/lib/diagramLayout'
import {
  blockLabel,
  blockTierFor,
  horizontalTicks,
  rulerLabel,
  smallBlockCallouts,
  spreadPositions,
  verticalTicks,
} from '@/lib/diagramStyle'
import { sizeFormatter, type SizeStyle } from '@/lib/inches'
import type { Block } from '@/lib/sheetView'
import type { SheetPlan } from '@/lib/types'

interface SheetDiagramProps {
  sheetW: number
  sheetH: number
  blocks: Block[]
  maxW?: number
  maxH?: number
  /** Structured cut-line data (sheet.cuts). Older records without it draw no cut lines. */
  cuts?: SheetPlan['cuts']
  /**
   * Index into `blocks` of the one block to draw with a solid highlight border instead of
   * its normal stroke (used by Leftover detail to point at the chosen leftover). Purely a
   * rendering overlay — it never changes geometry, scale or which label a block gets.
   */
  highlightIndex?: number
  /** How the sizes the app works out itself are written: fractions or decimals (follows how the job was typed). */
  sizeStyle?: SizeStyle
  /**
   * When true, the diagram measures its container's actual width AND height and fits the
   * whole drawing inside both (print pages, full screen). The caller must give the
   * container a real CSS height for this to have any effect.
   */
  fill?: boolean
  /**
   * Sizes the drawing by the container's width, so the sheet fills the card like a phone
   * screenshot, and lets its height follow (capped to the viewport so a wide laptop column
   * does not make a giant sheet). Used by Plan / Job detail / Leftover detail's main drawing.
   */
  autoHeight?: boolean
}

const LEFT = 72
const RIGHT = 22
/** Distance from the sheet to its width callout above and its height callout beside it. */
const SIDE_DIM = 28
/** The on-page drawing is drawn a touch smaller than the space it could fill (print/full screen still fill it). */
const PAGE_SCALE = 0.8
const TOP = 60
const RULER = 48
/** Gap between the sheet's right edge and a small block's note, and the room one note line takes. */
const CALLOUT_LEAD = 18
const CALLOUT_GAP_2 = 28
const CALLOUT_GAP_1 = 15

/** Largest font (up to `base`) that keeps `text` inside `maxPx`, using a rough glyph width. */
const fitFont = (text: string, maxPx: number, base: number) =>
  Math.max(9, Math.min(base, maxPx / (Math.max(text.length, 1) * 0.58)))

/**
 * Draws a sheet as a to-scale cutting drawing on a grid-paper card: blue pieces, green
 * hatched leftovers, a dashed orange cut path, rulers numbered from the bottom. (The colour key lives beside the drawing in PlanSheet.) Colour is never the only signal
 * (R15): every block carries text, and any block too small for its own text is listed under
 * the sheet. One SVG, so print and Save image keep working.
 */
export function SheetDiagram({
  sheetW,
  sheetH,
  blocks,
  maxW = 144,
  maxH = 288,
  cuts,
  highlightIndex,
  sizeStyle = 'decimal',
  fill = false,
  autoHeight = false,
}: SheetDiagramProps) {
  const F = useMemo(() => sizeFormatter(sizeStyle), [sizeStyle])
  const fmt = F.fmt
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerW, setContainerW] = useState(maxW + LEFT + RIGHT)
  const [containerH, setContainerH] = useState(maxH + TOP + RULER)
  const [vh, setVh] = useState(() => (typeof window === 'undefined' ? 800 : window.innerHeight))
  const uid = useId().replace(/:/g, '')

  // Measured before the browser paints, so the first frame already has the real size instead
  // of flashing the small starting guess for an instant and then jumping to full size.
  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    if (el.clientWidth > 0) setContainerW(el.clientWidth)
    if (fill && el.clientHeight > 0) setContainerH(el.clientHeight)
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      const h = entries[0]?.contentRect.height
      if (w && w > 0) setContainerW(w)
      if (fill && h && h > 0) setContainerH(h)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [fill])

  useEffect(() => {
    const onResize = () => setVh(window.innerHeight)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const g = useMemo(() => {
    // The sheet sits dead centre: the same margin on both sides, wide enough for the height
    // callout, its dimension line and the widest ruler number on the left.
    const fixedV = TOP + RULER
    const budgetH = fill ? containerH - fixedV : autoHeight ? Math.max(vh * 0.9, 420) - fixedV : maxH
    const fitScale = (m: number) =>
      Math.min(Math.max(containerW - 2 * m, 20) / sheetW, Math.max(budgetH, 60) / sheetH) * (fill ? 1 : PAGE_SCALE)
    const baseMargin = RIGHT + 40
    const widestNumber = Math.max(...verticalTicks(blocks, sheetH, fitScale(baseMargin)).map((t) => fmt(t.value).length))
    const rulerMargin = Math.max(baseMargin, SIDE_DIM + 19 + widestNumber * 6.8 + 8)
    // Blocks too small to write on get a note beside the sheet (right side) with a line to the
    // block, so the sheet is kept dead centre by widening both margins to fit the widest note.
    const noteMargin = (list: ReturnType<typeof smallBlockCallouts>) =>
      list.length ? CALLOUT_LEAD + Math.max(...list.map((c) => Math.max(c.name.length, c.dims.length))) * 6.4 + 8 : 0
    let margin = Math.max(rulerMargin, noteMargin(smallBlockCallouts(blocks, fitScale(rulerMargin), F)))
    margin = Math.max(margin, noteMargin(smallBlockCallouts(blocks, fitScale(margin), F)))
    const s = fitScale(margin)
    const sheetPxW = sheetW * s
    const sheetPxH = sheetH * s
    const sheetLeft = (containerW - sheetPxW) / 2
    const callouts = smallBlockCallouts(blocks, s, F)
    const twoLine = callouts.length * CALLOUT_GAP_2 <= sheetPxH - 12
    const gap = twoLine ? CALLOUT_GAP_2 : CALLOUT_GAP_1
    const sorted = [...callouts].sort((p, q) => p.ay - q.ay)
    const lo = TOP + 8
    const hi = Math.max(TOP + sheetPxH, lo + Math.max(sorted.length - 1, 0) * gap)
    const noteYs = spreadPositions(sorted.map((c) => TOP + c.ay * s), gap, lo, hi)
    const lastNote = noteYs.length ? noteYs[noteYs.length - 1] + (twoLine ? 22 : 8) : 0
    const extraH = Math.max(0, lastNote - (TOP + sheetPxH + RULER))
    const noteX = sheetLeft + sheetPxW + CALLOUT_LEAD
    const noteW = Math.max(containerW - noteX - 6, 20)
    const widest = Math.max(1, ...sorted.map((c) => (twoLine ? Math.max(c.name.length, c.dims.length) : c.name.length + c.dims.length + 2)))
    const noteFont = Math.max(8, Math.min(11.5, noteW / (widest * 0.58)))
    const svgW = containerW
    const svgH = TOP + sheetPxH + RULER + extraH
    return { s, sheetPxW, sheetPxH, sheetLeft, sorted, noteYs, twoLine, noteX, noteFont, svgW, svgH }
  }, [F, autoHeight, blocks, containerH, containerW, fill, fmt, maxH, sheetH, sheetW, vh])

  const { s, sheetPxW, sheetPxH, sheetLeft, sorted, noteYs, twoLine, noteX, noteFont, svgW, svgH } = g
  const X = (x: number) => sheetLeft + x * s
  const Y = (y: number) => TOP + y * s

  const cutLines = cuts ?? []
  const yTicks = verticalTicks(blocks, sheetH, s)
  const xTicks = horizontalTicks(sheetW)
  const hatchId = `hatch-${uid}`
  const gridId = `grid-${uid}`

  const pieceCount = blocks.filter((b) => b.kind === 'cut').length
  const leftoverCount = blocks.filter((b) => b.kind === 'free' || b.kind === 'freeNew' || b.kind === 'focus').length
  const ariaLabel = diagramAriaLabel(sheetW, sheetH, pieceCount, leftoverCount, cuts ? cuts.length : undefined)

  const calloutText = `${fmt(sheetW)}" Sheet Width`
  const calloutW = calloutText.length * 7.2 + 50
  const calloutCx = sheetLeft + sheetPxW / 2
  const dimX = sheetLeft - SIDE_DIM
  const heightText = `${fmt(sheetH)}" Sheet Height`
  const heightLong = heightText.length * 7.2 + 50
  const heightPill = heightLong <= sheetPxH - 12 ? heightText : `${fmt(sheetH)}"`
  const heightPillW = heightPill === heightText ? heightLong : heightPill.length * 7.2 + 50
  const showHeightPill = heightPillW <= sheetPxH - 12
  const midY = TOP + sheetPxH / 2

  const renderBlock = (b: Block, i: number) => {
    const bx = X(b.x)
    const by = Y(b.y)
    const bw = b.w * s
    const bh = b.h * s
    const tier = blockTierFor(b, s, F)
    const cx = bx + bw / 2
    const cy = by + bh / 2
    const highlighted = highlightIndex === i
    const label = tier === 'line' ? blockLabel(b, bw, bh, F) : null
    const isLeftover = b.kind === 'free' || b.kind === 'freeNew' || b.kind === 'focus'

    let body: JSX.Element
    if (b.kind === 'cut') {
      body = (
        <>
          <rect x={bx} y={by} width={bw} height={bh} fill="var(--dg-blue)" />
          {label && <LabelText label={label} cx={cx} cy={cy} fill="var(--dg-on-blue)" />}
          {tier === 'small' && (
            <text x={cx} y={cy + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--dg-on-blue)">
              {bw >= (String(b.n).length + 1) * 6.8 + 2 ? `#${b.n}` : b.n}
            </text>
          )}
        </>
      )
    } else if (isLeftover) {
      // A leftover shows only its letter; its size is listed once, under the sheet.
      const letterFits = bw >= 12 && bh >= 14
      const fs = Math.max(10, Math.min(22, Math.min(bw, bh) * 0.5))
      body = (
        <>
          <rect x={bx} y={by} width={bw} height={bh} fill="var(--dg-green-fill)" />
          <rect x={bx} y={by} width={bw} height={bh} fill={`url(#${hatchId})`} />
          <rect
            x={bx + 0.75}
            y={by + 0.75}
            width={Math.max(0, bw - 1.5)}
            height={Math.max(0, bh - 1.5)}
            fill="none"
            stroke="var(--dg-green-edge)"
            strokeWidth="1.5"
            strokeDasharray="5 3"
          />
          {letterFits && (
            <text x={cx} y={cy + fs * 0.35} textAnchor="middle" fontSize={fs} fontWeight="800" fill="var(--dg-green)">
              {b.letter}
            </text>
          )}
        </>
      )
    } else {
      // earlier cut (and anything else): a plain muted block
      const sizeText = `${fmt(b.w)} × ${fmt(b.h)}`
      body = (
        <>
          <rect x={bx} y={by} width={bw} height={bh} fill="var(--dg-earlier)" />
          {label && <LabelText label={label} cx={cx} cy={cy} fill="var(--dg-muted)" />}
          {(tier === 'full' || tier === 'medium') && (
            <>
              <text x={cx} y={cy + 4} textAnchor="middle" fontSize={fitFont(sizeText, bw - 14, 15)} fontWeight="700" fill="var(--dg-muted)">
                {sizeText}
              </text>
              {bh >= 60 && (
                <text x={cx} y={cy + 22} textAnchor="middle" fontSize="10" fontWeight="600" letterSpacing="1.2" fill="var(--dg-muted)">
                  ALREADY CUT
                </text>
              )}
            </>
          )}
        </>
      )
    }

    return (
      <g key={`b${i}`} pointerEvents="none">
        {body}
        {highlighted && (
          <rect x={bx + 1.5} y={by + 1.5} width={Math.max(0, bw - 3)} height={Math.max(0, bh - 3)} fill="none" stroke="var(--dg-text)" strokeWidth="2.5" />
        )}
      </g>
    )
  }

  return (
    <div
      ref={containerRef}
      className={fill ? 'flex h-full w-full items-center justify-center' : 'w-full'}
      style={fill || autoHeight ? undefined : { maxWidth: maxW + LEFT + RIGHT }}
    >
      <svg
        role="img"
        aria-label={ariaLabel}
        viewBox={`0 0 ${svgW} ${svgH}`}
        width={fill ? undefined : svgW}
        height={fill ? undefined : svgH}
        preserveAspectRatio="xMidYMid meet"
        className={fill ? 'h-full max-h-full w-full max-w-full font-sans' : 'block max-w-full font-sans'}
        style={{ overflow: 'visible' }}
      >
        <defs>
          <pattern id={hatchId} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="8" stroke="var(--dg-green-hatch)" strokeWidth="2.4" />
          </pattern>
          <pattern id={gridId} width="22" height="22" patternUnits="userSpaceOnUse">
            <path d="M22 0H0V22" fill="none" stroke="var(--dg-grid)" strokeWidth="1" />
          </pattern>
        </defs>

        {/* Grid-paper card */}
        <rect x="0.5" y="0.5" width={svgW - 1} height={svgH - 1} rx="6" fill="var(--dg-card)" />
        <rect x="0.5" y="0.5" width={svgW - 1} height={svgH - 1} rx="6" fill={`url(#${gridId})`} />
        <rect x="0.5" y="0.5" width={svgW - 1} height={svgH - 1} rx="6" fill="none" stroke="var(--dg-border)" />

        {/* Sheet width callout */}
        <line x1={sheetLeft} y1={TOP - 28} x2={sheetLeft + sheetPxW} y2={TOP - 28} stroke="var(--dg-border)" strokeWidth="1" />
        <rect x={calloutCx - calloutW / 2} y={TOP - 41} width={calloutW} height={26} rx={7} fill="var(--dg-card)" stroke="var(--dg-border)" />
        <g stroke="var(--dg-muted)" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d={`M${calloutCx - calloutW / 2 + 14} ${TOP - 24} v-6 m-2.5 2.5 l2.5 -2.5 l2.5 2.5`} />
          <path d={`M${calloutCx - calloutW / 2 + 19} ${TOP - 24} v6 m-2.5 -2.5 l2.5 2.5 l2.5 -2.5`} />
        </g>
        <text x={calloutCx + 10} y={TOP - 23} textAnchor="middle" fontSize="12.5" fontWeight="600" fill="var(--dg-text)">
          {calloutText}
        </text>

        {/* Sheet */}
        <rect x={sheetLeft} y={TOP} width={sheetPxW} height={sheetPxH} rx={3} fill="var(--dg-sheet)" />
        {blocks.map(renderBlock)}
        <rect x={sheetLeft} y={TOP} width={sheetPxW} height={sheetPxH} rx={3} fill="none" stroke="var(--dg-sheet-edge)" strokeWidth="2" pointerEvents="none" />

        {/* Cut path: dashed orange lines showing where the saw goes, from sheet.cuts */}
        {cutLines.map((c) => {
          const across = c.kind === 'across'
          return (
            <line
              key={`cut-line-${c.n}`}
              x1={across ? X(c.from) : X(c.pos)}
              y1={across ? Y(c.pos) : Y(c.from)}
              x2={across ? X(c.to) : X(c.pos)}
              y2={across ? Y(c.pos) : Y(c.to)}
              stroke="var(--dg-orange)"
              strokeWidth={2}
              strokeDasharray="7 4"
              pointerEvents="none"
            />
          )
        })}

        {/* Edge tape sits above the cut lines so the two never muddle each other */}
        {blocks.map((b, i) => (b.kind === 'cut' && b.tape ? <TapedEdges key={`tape${i}`} tape={b.tape} x={X(b.x)} y={Y(b.y)} w={b.w * s} h={b.h * s} /> : null))}

        {/* Sheet height callout: the width callout turned on its side, the same distance from the sheet */}
        <line x1={dimX} y1={TOP} x2={dimX} y2={TOP + sheetPxH} stroke="var(--dg-border)" strokeWidth="1" />
        {/* Left ruler numbers, counted up from the bottom, reaching back to the sheet */}
        {yTicks.map((t, i) => (
          <g key={`yt${i}`}>
            <line x1={dimX - 14} y1={TOP + t.y} x2={sheetLeft - 1} y2={TOP + t.y} stroke={t.end ? 'var(--dg-faint)' : 'var(--dg-green)'} strokeWidth="1" opacity={t.end ? 0.6 : 0.8} />
            <text
              x={dimX - 18}
              y={TOP + t.y + 4}
              textAnchor="end"
              fontSize="12"
              fontWeight="600"
              fill={t.end ? 'var(--dg-muted)' : 'var(--dg-green)'}
            >
              {fmt(t.value)}
            </text>
          </g>
        ))}
        {showHeightPill && (
          <g transform={`translate(${dimX} ${midY}) rotate(-90)`}>
            <rect x={-heightPillW / 2} y={-13} width={heightPillW} height={26} rx={7} fill="var(--dg-card)" stroke="var(--dg-border)" />
            {/* the same up/down arrows as the width callout, kept upright on screen */}
            <g transform={`translate(${-heightPillW / 2 + 16.5} 0) rotate(90)`} stroke="var(--dg-muted)" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <path d="M-2.5 4 v-6 m-2.5 2.5 l2.5 -2.5 l2.5 2.5" />
              <path d="M2.5 4 v6 m-2.5 -2.5 l2.5 2.5 l2.5 -2.5" />
            </g>
            <text x={10} y={4.5} textAnchor="middle" fontSize="12.5" fontWeight="600" fill="var(--dg-text)">
              {heightPill}
            </text>
          </g>
        )}

        {/* Bottom ruler */}
        <line x1={sheetLeft} y1={TOP + sheetPxH + 16} x2={sheetLeft + sheetPxW} y2={TOP + sheetPxH + 16} stroke="var(--dg-faint)" strokeWidth="1" />
        {xTicks.map((t, i) => (
          <g key={`xt${i}`}>
            <line x1={X(t.value)} y1={TOP + sheetPxH + 16} x2={X(t.value)} y2={TOP + sheetPxH + (t.major ? 24 : 21)} stroke="var(--dg-faint)" strokeWidth="1" />
            {t.major && (
              <text x={X(t.value)} y={TOP + sheetPxH + 40} textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--dg-muted)">
                {rulerLabel(t.value, fmt)}
              </text>
            )}
          </g>
        ))}

        {/* Blocks too small to hold their own size: a note beside the sheet with a line to the block */}
        {sorted.map((c, i) => {
          const y = noteYs[i]
          if (y === undefined) return null
          return (
            <g key={c.key}>
              <line x1={X(c.ax)} y1={Y(c.ay)} x2={noteX - 5} y2={y - 4} stroke="var(--dg-faint)" strokeWidth="1" strokeDasharray="2 2" />
              <circle cx={X(c.ax)} cy={Y(c.ay)} r={1.8} fill="var(--dg-faint)" />
              {twoLine ? (
                <>
                  <text x={noteX} y={y} fontSize={noteFont} fontWeight="700" fill="var(--dg-text)">
                    {c.name}
                  </text>
                  {c.dims && (
                    <text x={noteX} y={y + noteFont + 2} fontSize={noteFont} fill="var(--dg-muted)">
                      {c.dims}
                    </text>
                  )}
                </>
              ) : (
                <text x={noteX} y={y} fontSize={noteFont} fill="var(--dg-muted)">
                  <tspan fontWeight="700" fill="var(--dg-text)">
                    {c.name}
                  </tspan>
                  {c.dims && `  ${c.dims}`}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

/** A block's label: three short lines, or one line across it or (when narrow) up it. */
function LabelText({ label, cx, cy, fill }: { label: BlockLabelShape; cx: number; cy: number; fill: string }) {
  const { lines, size, rotated } = label
  if (rotated) {
    return (
      <text transform={`translate(${cx} ${cy}) rotate(-90)`} y={size * 0.35} textAnchor="middle" fontSize={size} fontWeight={800} fill={fill}>
        {lines[0]}
      </text>
    )
  }
  const lh = size * 1.25
  const top = cy - (lines.length * lh) / 2
  return (
    <>
      {lines.map((line, i) => (
        <text key={i} x={cx} y={top + i * lh + size * 0.95} textAnchor="middle" fontSize={size} fontWeight={i === 0 ? 800 : 700} fill={fill}>
          {line}
        </text>
      ))}
    </>
  )
}

type BlockLabelShape = { lines: string[]; size: number; rotated: boolean }

/**
 * Edge tape on a piece: a band in the primary colour along each taped side, drawn inside the
 * piece, with a dotted line down its middle (shortened where two taped sides meet so the dots
 * never cross) and, on a long enough side, the word TAPE.
 */
function TapedEdges({ tape, x, y, w, h }: { tape: NonNullable<Block['tape']>; x: number; y: number; w: number; h: number }) {
  const t = Math.max(2.5, Math.min(6, Math.min(w, h) / 12))
  const dots = { stroke: 'var(--dg-tape-ink)', strokeWidth: Math.max(1, t / 3), strokeDasharray: '0.1 4', strokeLinecap: 'round' as const }
  const word = t >= 5.5
  const text = (cx: number, cy: number, rotate: boolean) => (
    <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontSize="6.5" fontWeight="800" letterSpacing="1" fill="var(--dg-tape-ink)" transform={rotate ? `rotate(-90 ${cx} ${cy})` : undefined}>
      TAPE
    </text>
  )
  const gap = 2
  const startX = x + (tape.left ? t : gap)
  const endX = x + w - (tape.right ? t : gap)
  const startY = y + (tape.top ? t : gap)
  const endY = y + h - (tape.bottom ? t : gap)
  return (
    <g pointerEvents="none">
      {tape.top && (
        <g>
          <rect x={x} y={y} width={w} height={t} fill="var(--dg-tape)" />
          <line x1={startX} y1={y + t / 2} x2={endX} y2={y + t / 2} {...dots} />
          {word && w >= 90 && text(x + w / 2, y + t / 2, false)}
        </g>
      )}
      {tape.bottom && (
        <g>
          <rect x={x} y={y + h - t} width={w} height={t} fill="var(--dg-tape)" />
          <line x1={startX} y1={y + h - t / 2} x2={endX} y2={y + h - t / 2} {...dots} />
          {word && w >= 90 && text(x + w / 2, y + h - t / 2, false)}
        </g>
      )}
      {tape.left && (
        <g>
          <rect x={x} y={y} width={t} height={h} fill="var(--dg-tape)" />
          <line x1={x + t / 2} y1={startY} x2={x + t / 2} y2={endY} {...dots} />
          {word && h >= 90 && text(x + t / 2, y + h / 2, true)}
        </g>
      )}
      {tape.right && (
        <g>
          <rect x={x + w - t} y={y} width={t} height={h} fill="var(--dg-tape)" />
          <line x1={x + w - t / 2} y1={startY} x2={x + w - t / 2} y2={endY} {...dots} />
          {word && h >= 90 && text(x + w - t / 2, y + h / 2, true)}
        </g>
      )}
    </g>
  )
}
