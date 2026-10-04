import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { diagramAriaLabel } from '@/lib/diagramLayout'
import {
  blockTierFor,
  CHIP_MIN_H,
  horizontalTicks,
  placeBadges,
  rulerLabel,
  smallBlockNotes,
  verticalTicks,
} from '@/lib/diagramStyle'
import { fmt, fmtLeft } from '@/lib/inches'
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
  /** Which cut step (1-based) is highlighted, controlled by the Cut order list. */
  activeCut?: number | null
  onCutToggle?: (n: number) => void
  /**
   * Index into `blocks` of the one block to draw with a solid highlight border instead of
   * its normal stroke (used by Leftover detail to point at the chosen leftover). Purely a
   * rendering overlay — it never changes geometry, scale or which label a block gets.
   */
  highlightIndex?: number
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
const NOTE_LINE = 16

/** Largest font (up to `base`) that keeps `text` inside `maxPx`, using a rough glyph width. */
const fitFont = (text: string, maxPx: number, base: number) =>
  Math.max(9, Math.min(base, maxPx / (Math.max(text.length, 1) * 0.58)))

/**
 * Draws a sheet as a to-scale cutting drawing on a grid-paper card: blue pieces, green
 * hatched leftovers, a dashed orange cut path with numbered badges (the engine's own cut
 * numbers), rulers numbered from the bottom. (The colour key lives beside the drawing in PlanSheet.) Colour is never the only signal
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
  activeCut = null,
  onCutToggle,
  highlightIndex,
  fill = false,
  autoHeight = false,
}: SheetDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerW, setContainerW] = useState(maxW + LEFT + RIGHT)
  const [containerH, setContainerH] = useState(maxH + TOP + RULER)
  const [vh, setVh] = useState(() => (typeof window === 'undefined' ? 800 : window.innerHeight))
  const uid = useId().replace(/:/g, '')

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
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
    const margin = Math.max(baseMargin, SIDE_DIM + 19 + widestNumber * 6.8 + 8)
    const s = fitScale(margin)
    const sheetPxW = sheetW * s
    const sheetPxH = sheetH * s
    const sheetLeft = (containerW - sheetPxW) / 2
    const notes = smallBlockNotes(blocks, s)
    const notesH = notes.length ? notes.length * NOTE_LINE + 10 : 0
    const svgW = containerW
    const svgH = TOP + sheetPxH + RULER + notesH
    return { s, sheetPxW, sheetPxH, sheetLeft, notes, svgW, svgH }
  }, [autoHeight, blocks, containerH, containerW, fill, maxH, sheetH, sheetW, vh])

  const { s, sheetPxW, sheetPxH, sheetLeft, notes, svgW, svgH } = g
  const X = (x: number) => sheetLeft + x * s
  const Y = (y: number) => TOP + y * s

  const cutLines = cuts ?? []
  const badges = placeBadges(
    cutLines.map((c) =>
      c.kind === 'across'
        ? { n: c.n, x: X(c.to) + 5, y: Y(c.pos), axis: 'y' as const }
        : { n: c.n, x: X(c.pos), y: Y(c.from) - 2, axis: 'x' as const },
    ),
  )

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
    const tier = blockTierFor(b, s)
    const cx = bx + bw / 2
    const cy = by + bh / 2
    const highlighted = highlightIndex === i
    const isLeftover = b.kind === 'free' || b.kind === 'freeNew' || b.kind === 'focus'

    let body: JSX.Element
    if (b.kind === 'cut') {
      const sizeText = b.label ?? `${fmt(b.w)} × ${fmt(b.h)}`
      // Medium blocks keep the "#n" tag above the size when tall enough, else it joins the size.
      const tagged = tier === 'medium' && bh >= CHIP_MIN_H
      const shown = tier === 'medium' && !tagged ? `#${b.n} · ${sizeText}` : sizeText
      const fs = fitFont(shown, bw - 14, tier === 'full' ? 22 : 15)
      const textY = tier === 'full' ? cy + 2 : tagged ? by + 22 + (bh - 22) / 2 + 5 : cy + 5
      body = (
        <>
          <rect x={bx} y={by} width={bw} height={bh} fill="var(--dg-blue)" />
          {tier === 'full' && (
            <>
              <rect x={bx + 8} y={by + 8} width={52} height={22} rx={6} fill="black" fillOpacity={0.3} />
              <text x={bx + 34} y={by + 23} textAnchor="middle" fontSize="11.5" fontWeight="700" fill="var(--dg-on-blue)">
                Piece
              </text>
              <text x={bx + 12} y={by + 46} fontSize="12" fontWeight="700" fill="var(--dg-on-blue)">
                {b.n}
              </text>
              <text x={bx + bw - 10} y={by + 22} textAnchor="end" fontSize="12.5" fontWeight="700" fill="var(--dg-on-blue)">
                {fmt(b.w)}"
              </text>
              <text x={bx + 10} y={by + bh - 10} fontSize="12.5" fontWeight="700" fill="var(--dg-on-blue)">
                {fmt(b.h)}"
              </text>
            </>
          )}
          {tagged && (
            <text x={bx + 8} y={by + 18} fontSize="11.5" fontWeight="700" fill="var(--dg-on-blue)">
              #{b.n}
            </text>
          )}
          {(tier === 'full' || tier === 'medium') && (
            <>
              <text x={cx} y={textY} textAnchor="middle" fontSize={fs} fontWeight="800" fill="var(--dg-on-blue)">
                {shown}
              </text>
              {tier === 'full' && (
                <text x={cx} y={cy + 22} textAnchor="middle" fontSize="10" fontWeight="600" letterSpacing="1.4" fill="var(--dg-on-blue)" opacity={0.85}>
                  REQUIRED CUT
                </text>
              )}
            </>
          )}
          {tier === 'small' && (
            <text x={cx} y={cy + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--dg-on-blue)">
              {b.n}
            </text>
          )}
        </>
      )
    } else if (isLeftover) {
      const sizeText = fmtLeft(b.w, b.h)
      // Same for leftovers: the letter chip needs room above the size, else the letter joins it.
      const chipped = tier === 'full' || (tier === 'medium' && bh >= CHIP_MIN_H)
      const shown = tier === 'medium' && !chipped ? `${b.letter} · ${sizeText}` : sizeText
      const fs = fitFont(`${shown}${tier === 'full' ? ' free' : ''}`, bw - 14, tier === 'full' ? 20 : 15)
      const textY = tier === 'full' ? cy + 2 : chipped ? by + 30 + (bh - 30) / 2 + 5 : cy + 5
      const caption = b.kind === 'free' ? 'Saved' : 'Offcut'
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
          {chipped && (
            <>
              <rect x={bx + 8} y={by + 8} width={tier === 'full' ? 44 : 30} height={22} rx={6} fill="var(--dg-card)" stroke="var(--dg-green-edge)" />
              <text x={bx + 8 + (tier === 'full' ? 22 : 15)} y={by + 23} textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--dg-green)">
                {b.letter}
                {tier === 'full' ? ' •' : ''}
              </text>
            </>
          )}
          {tier === 'full' && (
            <>
              <text x={bx + 10} y={by + 46} fontSize="11.5" fontWeight="600" fill="var(--dg-green)">
                {caption}
              </text>
              <text x={bx + bw - 10} y={by + 22} textAnchor="end" fontSize="12" fontWeight="600" fill="var(--dg-green)">
                {fmt(b.w)}" width
              </text>
              <text x={bx + 10} y={by + bh - 10} fontSize="12" fontWeight="600" fill="var(--dg-green)">
                {fmt(b.h)}" height
              </text>
            </>
          )}
          {tier === 'medium' && bw >= 64 && (
            <text x={bx + bw - 8} y={by + 22} textAnchor="end" fontSize="12" fontWeight="600" fill="var(--dg-green)">
              {fmt(b.w)}"
            </text>
          )}
          {tier === 'medium' && bh >= 120 && bw >= 64 && (
            <text x={bx + bw - 8} y={by + bh - 10} textAnchor="end" fontSize="12" fontWeight="600" fill="var(--dg-green)">
              {fmt(b.h)}"
            </text>
          )}
          {(tier === 'full' || tier === 'medium') && (
            <>
              <text x={cx} y={textY} textAnchor="middle" fontSize={fs} fontWeight="800" fill="var(--dg-green)">
                {shown}
                {tier === 'full' ? ' free' : ''}
              </text>
              {(tier === 'full' ? bh >= 70 : chipped && bh >= 86) && (
                <text x={cx} y={tier === 'full' ? cy + 22 : textY + 19} textAnchor="middle" fontSize="10" fontWeight="600" letterSpacing="1.2" fill="var(--dg-green)" opacity={0.85}>
                  {tier === 'full' ? 'Reusable Clean Stock' : 'STOCK'}
                </text>
              )}
            </>
          )}
          {tier === 'small' && (
            <text x={cx} y={cy + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--dg-green)">
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

        {/* Cut path: dashed orange lines with numbered badges, from sheet.cuts (the engine's own numbering) */}
        {cutLines.map((c) => {
          const active = activeCut === c.n
          const dim = activeCut != null && !active
          const across = c.kind === 'across'
          const x1 = across ? X(c.from) : X(c.pos)
          const y1 = across ? Y(c.pos) : Y(c.from)
          const x2 = across ? X(c.to) : X(c.pos)
          const y2 = across ? Y(c.pos) : Y(c.to)
          return (
            <line
              key={`cut-line-${c.n}`}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="var(--dg-orange)"
              strokeWidth={active ? 3 : 2}
              strokeDasharray="7 4"
              opacity={dim ? 0.4 : 1}
              pointerEvents="none"
            />
          )
        })}
        {badges.map((b) => {
          const active = activeCut === b.n
          const dim = activeCut != null && !active
          const moved = Math.abs(b.x - b.ox) > 0.5 || Math.abs(b.y - b.oy) > 0.5
          return (
            <g key={`cut-badge-${b.n}`}>
              {moved && (
                <line x1={b.ox} y1={b.oy} x2={b.x} y2={b.y} stroke="var(--dg-orange)" strokeWidth="1.5" opacity={dim ? 0.4 : 1} pointerEvents="none" />
              )}
              <CutBadge cx={b.x} cy={b.y} n={b.n} active={active} dim={dim} onToggle={() => onCutToggle?.(b.n)} />
            </g>
          )
        })}

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

        {/* Blocks too small to hold their own size are listed here, so none is left unlabelled */}
        {notes.map((n, i) => (
          <text key={n.key} x={sheetLeft} y={TOP + sheetPxH + RULER + 12 + i * NOTE_LINE} fontSize="11.5" fill="var(--dg-muted)">
            • {n.text}
          </text>
        ))}
      </svg>
    </div>
  )
}

function CutBadge({
  cx,
  cy,
  n,
  active,
  dim,
  onToggle,
}: {
  cx: number
  cy: number
  n: number
  active: boolean
  dim: boolean
  onToggle: () => void
}) {
  const onKey = (e: KeyboardEvent<SVGGElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onToggle()
    }
  }
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={`Cut ${n}`}
      aria-pressed={active}
      onClick={onToggle}
      onKeyDown={onKey}
      style={{ cursor: 'pointer', outline: 'none' }}
      className="focus-visible:opacity-90"
    >
      {/* Generous invisible hit target keeps the >=44px tap-target rule without changing the
          drawn circle's size. */}
      <circle cx={cx} cy={cy} r={22} fill="transparent" />
      <circle
        cx={cx}
        cy={cy}
        r={active ? 13 : 11.5}
        fill="var(--dg-orange)"
        stroke="var(--dg-card)"
        strokeWidth={active ? 3 : 2}
        opacity={dim ? 0.45 : 1}
      />
      <text x={cx} y={cy + 4} textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--dg-on-orange)" pointerEvents="none">
        {n}
      </text>
    </g>
  )
}
