import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  blockCallouts,
  chooseLabel,
  computeWasteCells,
  diagramAriaLabel,
  edgesToSegments,
  estimateTextWidth,
  extractEdges,
  nudgeLabels,
  wasteLabelFits,
  type CutLineLayout,
} from '@/lib/diagramLayout'
import { fmt } from '@/lib/inches'
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
   * When true, the diagram measures and fills its container's actual width AND height
   * (up to maxW/maxH as an outer ceiling) instead of staying a small fixed-size picture.
   * The caller must give the container a real CSS height for this to have any effect —
   * used by Plan/Job detail's main (non-fullscreen, non-compact) drawing on wide screens.
   * Leftover detail's intentionally compact preview leaves this off.
   */
  fill?: boolean
}

const LEFT_MARGIN = 90
const TOP_MARGIN = 64
const RIGHT_MARGIN = 80
const BOTTOM_MARGIN = 32

/**
 * Draws a sheet as a technical/engineering-style cutting drawing: outline, pieces,
 * hatched leftovers and waste, numbered dashed cut lines, and dimension lines with
 * tick marks. Colour is never the only signal (R15): every block carries text or a
 * letter, and hatching patterns independently distinguish leftover / waste / earlier.
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
}: SheetDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerW, setContainerW] = useState(maxW + LEFT_MARGIN + RIGHT_MARGIN)
  const [containerH, setContainerH] = useState(maxH + TOP_MARGIN + BOTTOM_MARGIN + 28)
  const uidBase = useId()

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

  const layout = useMemo(() => {
    const availW = Math.max(containerW - LEFT_MARGIN - RIGHT_MARGIN, 20)
    // Filling a laptop-height column: the container's own measured height becomes the
    // real budget, instead of the small fixed maxH default that kept the drawing a
    // small picture regardless of how much space was actually available.
    const effectiveMaxH = fill ? Math.max(containerH - TOP_MARGIN - BOTTOM_MARGIN - 28, 100) : maxH
    const pxPerInch = Math.min(availW / sheetW, effectiveMaxH / sheetH)
    const sheetPxW = sheetW * pxPerInch
    const sheetPxH = sheetH * pxPerInch
    const svgW = LEFT_MARGIN + sheetPxW + RIGHT_MARGIN
    const baseSvgH = TOP_MARGIN + sheetPxH + BOTTOM_MARGIN + 28 // + ruler strip

    const region = { x: 0, y: 0, w: sheetW, h: sheetH }
    const wasteCells = computeWasteCells(blocks, region)
    const cutLines: CutLineLayout[] = cuts ?? []

    // Dimension edges from pieces + leftovers only (not waste/earlier), per spec.
    const dimBlocks = blocks.filter((b) => b.kind === 'cut' || b.kind === 'free' || b.kind === 'freeNew' || b.kind === 'focus')
    const xEdges = extractEdges(dimBlocks, 'x', 0, sheetW)
    const yEdges = extractEdges(dimBlocks, 'y', 0, sheetH)
    const xSegs = edgesToSegments(xEdges)
    const ySegs = edgesToSegments(yEdges)

    const xLabels = xSegs.map((s) => ({
      center: LEFT_MARGIN + ((s.from + s.to) / 2) * pxPerInch,
      text: s.label,
      halfWidth: estimateTextWidth(s.label) / 2,
    }))
    const xNudge = nudgeLabels(xLabels)

    const yLabels = ySegs.map((s) => ({
      center: TOP_MARGIN + ((s.from + s.to) / 2) * pxPerInch,
      text: s.label,
      halfWidth: 6, // vertical stack: height doesn't crowd horizontally
    }))
    const yNudge = nudgeLabels(yLabels, 4)

    // Every piece, already-cut piece and leftover whose label is too small to draw
    // inline (a 'legend' or 'badge' choice) gets a dotted callout outside the sheet
    // instead, never rotated text. Stacked via nudgeLabels so callouts on one sheet
    // never touch. Waste keeps its own simple "Waste" text (no size), unrelated to this.
    // Text is fit to RIGHT_MARGIN minus the leader-line offset (22px) and a 4px right
    // padding, so a callout can never run past the SVG's own right edge into whatever
    // sits beside the diagram (e.g. print's info column) — the fix for callout text
    // overlapping neighbouring content.
    const calloutMaxTextWidth = Math.max(RIGHT_MARGIN - 22 - 4, 20)
    const callouts = blockCallouts(blocks, pxPerInch, calloutMaxTextWidth)
    // Callouts are never dropped (nudgeLabels' Infinity factor above), so the SVG's own
    // height must grow to actually fit them when a sheet is crowded enough to nudge one
    // past the sheet's own bottom edge — otherwise a callout could be pushed past the
    // viewBox and clipped by an ancestor's overflow:hidden even though it was "placed".
    const maxCalloutY = callouts.reduce((max, c) => Math.max(max, TOP_MARGIN + c.y), 0)
    const svgH = Math.max(baseSvgH, maxCalloutY + 12)

    return {
      pxPerInch,
      sheetPxW,
      sheetPxH,
      svgW,
      svgH,
      wasteCells,
      cutLines,
      xSegs,
      ySegs,
      xNudge,
      yNudge,
      callouts,
    }
  }, [blocks, containerW, cuts, maxH, sheetH, sheetW])

  const { pxPerInch, sheetPxW, sheetPxH, svgW, svgH, wasteCells, cutLines, xNudge, yNudge, callouts } = layout

  const pieceCount = blocks.filter((b) => b.kind === 'cut').length
  const leftoverCount = blocks.filter((b) => b.kind === 'free' || b.kind === 'freeNew' || b.kind === 'focus').length
  const ariaLabel = diagramAriaLabel(sheetW, sheetH, pieceCount, leftoverCount, cuts ? cuts.length : undefined)

  const X = (inX: number) => LEFT_MARGIN + inX * pxPerInch
  const Y = (inY: number) => TOP_MARGIN + inY * pxPerInch

  function toggleCut(n: number) {
    onCutToggle?.(n)
  }

  return (
    <div
      ref={containerRef}
      className={fill ? 'flex h-full w-full items-center justify-center' : 'w-full'}
      style={fill ? undefined : { maxWidth: maxW + LEFT_MARGIN + RIGHT_MARGIN }}
    >
      <svg
        role="img"
        aria-label={ariaLabel}
        viewBox={`0 0 ${svgW} ${svgH}`}
        width={fill ? undefined : svgW}
        height={fill ? undefined : svgH}
        preserveAspectRatio="xMidYMid meet"
        className={fill ? 'h-full max-h-full w-full max-w-full font-sans' : 'max-w-full font-sans'}
        style={{ overflow: 'visible' }}
      >
        <defs>
          <pattern id={`${uidBase}-hatch-leftover`} width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--success-border)" strokeWidth="1" opacity="0.35" />
          </pattern>
          <pattern id={`${uidBase}-hatch-waste`} width="5" height="5" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="0" y2="5" stroke="var(--border-strong)" strokeWidth="1" opacity="0.5" />
            <line x1="0" y1="0" x2="5" y2="0" stroke="var(--border-strong)" strokeWidth="1" opacity="0.5" />
          </pattern>
          <marker id={`${uidBase}-arrow-start`} viewBox="0 0 10 10" refX="1" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M9,1 L1,5 L9,9" fill="none" stroke="var(--muted-foreground)" strokeWidth="1.5" />
          </marker>
          <marker id={`${uidBase}-arrow-end`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M1,1 L9,5 L1,9" fill="none" stroke="var(--muted-foreground)" strokeWidth="1.5" />
          </marker>
        </defs>

        {/* Waste, grey crossed-hatch */}
        {wasteCells.map((c, i) => {
          const pw = c.w * pxPerInch
          const ph = c.h * pxPerInch
          const showLabel = wasteLabelFits(pw, ph)
          return (
            <g key={`waste-${i}`}>
              <rect
                x={X(c.x)}
                y={Y(c.y)}
                width={pw}
                height={ph}
                fill={`url(#${uidBase}-hatch-waste)`}
                stroke="var(--border-strong)"
                strokeWidth="1"
              />
              {showLabel && (
                <text
                  x={X(c.x) + pw / 2}
                  y={Y(c.y) + ph / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize="11"
                  fill="var(--muted-foreground)"
                >
                  Waste
                </text>
              )}
            </g>
          )
        })}

        {/* Already-cut pieces: a plain muted grey-blue block, same clean style as any
            other block, no hatching — hatching stays only on green leftovers. Its size
            is always shown; "Already cut" is a second line only when there's room. */}
        {blocks
          .filter((b) => b.kind === 'earlier')
          .map((b, i) => {
            const pw = b.w * pxPerInch
            const ph = b.h * pxPerInch
            const plan = chooseLabel(b, pxPerInch).earlier!
            return (
              <g key={`earlier-${i}`}>
                <rect
                  x={X(b.x)}
                  y={Y(b.y)}
                  width={pw}
                  height={ph}
                  fill="var(--muted)"
                  stroke="var(--border-strong)"
                  strokeWidth="1"
                />
                {plan.kind === 'two-line' && (
                  <>
                    <text x={X(b.x) + pw / 2} y={Y(b.y) + ph / 2 - 6} textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--muted-foreground)">
                      {plan.line1}
                    </text>
                    <text x={X(b.x) + pw / 2} y={Y(b.y) + ph / 2 + 8} textAnchor="middle" fontSize="11" fill="var(--faint)">
                      {plan.line2}
                    </text>
                  </>
                )}
                {plan.kind === 'one-line' && (
                  <text x={X(b.x) + pw / 2} y={Y(b.y) + ph / 2} textAnchor="middle" dominantBaseline="middle" fontSize="11" fontWeight="600" fill="var(--muted-foreground)">
                    {plan.line1}
                  </text>
                )}
              </g>
            )
          })}

        {/* Free leftovers: existing free, this plan's freeNew, focus */}
        {blocks
          .map((b, blockIndex) => ({ b, blockIndex }))
          .filter(({ b }) => b.kind === 'free' || b.kind === 'freeNew' || b.kind === 'focus')
          .map(({ b, blockIndex }) => {
            const pw = b.w * pxPerInch
            const ph = b.h * pxPerInch
            const plan = chooseLabel(b, pxPerInch)
            const highlighted = highlightIndex === blockIndex
            const strokeW = highlighted ? 1.5 : 1
            const dashed = !highlighted
            const choice = plan.free!
            return (
              <g key={`free-${blockIndex}`}>
                <rect
                  x={X(b.x)}
                  y={Y(b.y)}
                  width={pw}
                  height={ph}
                  fill="var(--success-bg)"
                  stroke="var(--success-border)"
                  strokeWidth={strokeW}
                  strokeDasharray={dashed ? '4 3' : undefined}
                />
                <rect x={X(b.x)} y={Y(b.y)} width={pw} height={ph} fill={`url(#${uidBase}-hatch-leftover)`} />
                {choice.kind === 'wide' && (
                  <text
                    x={X(b.x) + pw / 2}
                    y={Y(b.y) + ph / 2}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize="12"
                    fontWeight="600"
                    fill="var(--success-text)"
                  >
                    {choice.letter} · {choice.dims}
                    {choice.showFree ? ' free' : ''}
                  </text>
                )}
                {choice.kind === 'stacked' && (
                  <>
                    <text
                      x={X(b.x) + pw / 2}
                      y={Y(b.y) + ph / 2 - 6}
                      textAnchor="middle"
                      fontSize="11"
                      fontWeight="600"
                      fill="var(--success-text)"
                    >
                      {choice.letter}
                    </text>
                    <text
                      x={X(b.x) + pw / 2}
                      y={Y(b.y) + ph / 2 + 8}
                      textAnchor="middle"
                      fontSize="11"
                      fontWeight="600"
                      fill="var(--success-text)"
                    >
                      {choice.dims}
                    </text>
                  </>
                )}
              </g>
            )
          })}

        {/* Dotted callouts for any block too small for its inline label — piece,
            already-cut piece, or leftover — never rotated text. y-nudged apart so
            several on one sheet (A3, C2, C3, C4...) never overlap each other's text. */}
        {callouts.map((c) => {
          const kind = blocks[c.blockIndex]?.kind
          const color = kind === 'cut' ? 'var(--accent-text)' : kind === 'earlier' ? 'var(--muted-foreground)' : 'var(--success-text)'
          const x1 = LEFT_MARGIN + c.anchorX
          const y1 = TOP_MARGIN + c.anchorY
          const x2 = x1 + 18
          const y2 = TOP_MARGIN + c.y
          return (
            <g key={`callout-${c.blockIndex}`}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth="1" strokeDasharray="1 3" strokeLinecap="round" />
              <circle cx={x2} cy={y2} r="2" fill={color} />
              <text x={x2 + 4} y={y2} dominantBaseline="middle" fontSize="11" fontWeight="600" fill={color}>
                {c.text}
              </text>
            </g>
          )
        })}

        {/* Pieces */}
        {blocks
          .filter((b) => b.kind === 'cut')
          .map((b, i) => {
            const pw = b.w * pxPerInch
            const ph = b.h * pxPerInch
            const plan = chooseLabel(b, pxPerInch).piece!
            return (
              <g key={`cut-${i}`}>
                <rect
                  x={X(b.x)}
                  y={Y(b.y)}
                  width={pw}
                  height={ph}
                  fill="var(--accent-bg)"
                  stroke="var(--accent-border)"
                  strokeWidth="1"
                />
                {plan.kind === 'two-line' && (
                  <>
                    <text
                      x={X(b.x) + pw / 2}
                      y={Y(b.y) + ph / 2 - 6}
                      textAnchor="middle"
                      fontSize="12"
                      fontWeight="600"
                      fill="var(--accent-text)"
                    >
                      {plan.line1}
                    </text>
                    <text
                      x={X(b.x) + pw / 2}
                      y={Y(b.y) + ph / 2 + 8}
                      textAnchor="middle"
                      fontSize="12"
                      fontWeight="600"
                      fill="var(--accent-text)"
                    >
                      {plan.line2}
                    </text>
                  </>
                )}
                {plan.kind === 'one-line' && (
                  <text
                    x={X(b.x) + pw / 2}
                    y={Y(b.y) + ph / 2}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize="11"
                    fontWeight="600"
                    fill="var(--accent-text)"
                  >
                    {plan.line1}
                  </text>
                )}
              </g>
            )
          })}

        {/* Sheet outline, thick neutral stroke */}
        <rect
          x={X(0)}
          y={Y(0)}
          width={sheetPxW}
          height={sheetPxH}
          fill="none"
          stroke="var(--border-stronger)"
          strokeWidth="2"
        />

        {/* Numbered dashed cut lines */}
        {cutLines.map((c) => {
          const isActive = activeCut === c.n
          const dimmed = activeCut != null && !isActive
          const stroke = 'var(--muted-foreground)'
          const strokeWidth = isActive ? 2.5 : 1
          const opacity = dimmed ? 0.3 : isActive ? 1 : 0.75
          if (c.kind === 'across') {
            const y = Y(c.pos)
            const x1 = X(c.from) - 8
            const x2 = X(c.to) + 8
            const circleX = x2 + 12
            return (
              <g key={`cut-line-${c.n}`}>
                <line x1={x1} y1={y} x2={x2} y2={y} stroke={stroke} strokeWidth={strokeWidth} strokeDasharray="6 4" opacity={opacity} />
                <CutCircle cx={circleX} cy={y} n={c.n} active={isActive} onToggle={() => toggleCut(c.n)} />
              </g>
            )
          }
          const x = X(c.pos)
          const y1 = Y(c.from) - 8
          const y2 = Y(c.to) + 8
          // The circle sits at the line's own top end, not a fixed offset from the
          // dimension-line zone above the sheet — a fixed offset drifts into the
          // dimension numbers whenever the region doesn't start at the sheet's own
          // top edge (a sub-region on Leftover detail, for example).
          const circleY = y1 - 4
          return (
            <g key={`cut-line-${c.n}`}>
              <line x1={x} y1={y1} x2={x} y2={y2} stroke={stroke} strokeWidth={strokeWidth} strokeDasharray="6 4" opacity={opacity} />
              <CutCircle cx={x} cy={circleY} n={c.n} active={isActive} onToggle={() => toggleCut(c.n)} />
            </g>
          )
        })}

        {/* Dimension lines: overall + segment ticks, top and left */}
        <DimensionOverall
          x1={X(0)}
          x2={X(sheetW)}
          y={TOP_MARGIN - 40}
          label={fmt(sheetW)}
          orientation="horizontal"
          uidBase={uidBase}
        />
        <DimensionOverall
          x1={Y(0)}
          x2={Y(sheetH)}
          y={LEFT_MARGIN - 40}
          label={fmt(sheetH)}
          orientation="vertical"
          uidBase={uidBase}
        />

        {/* Segment tick marks + labels, top */}
        <line x1={LEFT_MARGIN} y1={TOP_MARGIN - 18} x2={LEFT_MARGIN + sheetPxW} y2={TOP_MARGIN - 18} stroke="var(--border-strong)" strokeWidth="1" />
        {layout.xSegs.map((s, i) => (
          <line
            key={`xtick-${i}`}
            x1={X(s.from)}
            y1={TOP_MARGIN - 22}
            x2={X(s.from)}
            y2={TOP_MARGIN - 14}
            stroke="var(--border-strong)"
            strokeWidth="1"
          />
        ))}
        <line
          x1={X(sheetW)}
          y1={TOP_MARGIN - 22}
          x2={X(sheetW)}
          y2={TOP_MARGIN - 14}
          stroke="var(--border-strong)"
          strokeWidth="1"
        />
        {xNudge.placed.map((lbl, i) => (
          <g key={`xlabel-${i}`}>
            {lbl.leader && (
              <line x1={lbl.naturalCenter} y1={TOP_MARGIN - 12} x2={lbl.center} y2={TOP_MARGIN - 26} stroke="var(--faint)" strokeWidth="0.75" />
            )}
            <text x={lbl.center} y={lbl.leader ? TOP_MARGIN - 28 : TOP_MARGIN - 8} textAnchor="middle" fontSize="12" fill="var(--muted-foreground)">
              {lbl.text}
            </text>
          </g>
        ))}

        {/* Segment tick marks + labels, left */}
        <line x1={LEFT_MARGIN - 18} y1={TOP_MARGIN} x2={LEFT_MARGIN - 18} y2={TOP_MARGIN + sheetPxH} stroke="var(--border-strong)" strokeWidth="1" />
        {layout.ySegs.map((s, i) => (
          <line
            key={`ytick-${i}`}
            x1={LEFT_MARGIN - 22}
            y1={Y(s.from)}
            x2={LEFT_MARGIN - 14}
            y2={Y(s.from)}
            stroke="var(--border-strong)"
            strokeWidth="1"
          />
        ))}
        {yNudge.placed.map((lbl, i) => (
          <text key={`ylabel-${i}`} x={LEFT_MARGIN - 26} y={lbl.center} textAnchor="end" dominantBaseline="middle" fontSize="12" fill="var(--muted-foreground)">
            {lbl.text}
          </text>
        ))}

        {/* Ruler along the bottom edge: ticks every 12 in, labels at 0/24/48-style intervals */}
        <Ruler x0={X(0)} pxPerInch={pxPerInch} sheetW={sheetW} y={TOP_MARGIN + sheetPxH + 10} />
      </svg>

      {(xNudge.overflow.length > 0 || yNudge.overflow.length > 0) && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          {[...xNudge.overflow, ...yNudge.overflow].map((t) => `${t} in`).join(', ')}
        </p>
      )}
    </div>
  )
}

function CutCircle({
  cx,
  cy,
  n,
  active,
  onToggle,
}: {
  cx: number
  cy: number
  n: number
  active: boolean
  onToggle: () => void
}) {
  return (
    <g
      role="button"
      tabIndex={0}
      aria-pressed={active}
      aria-label={`Cut ${n}`}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onToggle()
        }
      }}
      style={{ cursor: 'pointer', outline: 'none' }}
      className="focus-visible:opacity-90"
    >
      {/* Generous invisible hit target keeps the >=44px tap-target rule without changing the
          drawn circle's size. */}
      <circle cx={cx} cy={cy} r="22" fill="transparent" />
      <circle
        cx={cx}
        cy={cy}
        r="9"
        fill={active ? 'var(--accent-text)' : 'var(--background)'}
        stroke="var(--muted-foreground)"
        strokeWidth="1.25"
      />
      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fontSize="11" fontWeight="600" fill={active ? 'var(--background)' : 'var(--muted-foreground)'}>
        {n}
      </text>
    </g>
  )
}

function DimensionOverall({
  x1,
  x2,
  y,
  label,
  orientation,
  uidBase,
}: {
  x1: number
  x2: number
  y: number
  label: string
  orientation: 'horizontal' | 'vertical'
  uidBase: string
}) {
  if (orientation === 'horizontal') {
    return (
      <g>
        <line
          x1={x1}
          y1={y}
          x2={x2}
          y2={y}
          stroke="var(--muted-foreground)"
          strokeWidth="1"
          markerStart={`url(#${uidBase}-arrow-start)`}
          markerEnd={`url(#${uidBase}-arrow-end)`}
        />
        <text x={(x1 + x2) / 2} y={y - 6} textAnchor="middle" fontSize="12" fontWeight="500" fill="var(--muted-foreground)">
          {label}
        </text>
      </g>
    )
  }
  // Vertical: x1/x2 are actually the y-range; y param is the x position.
  return (
    <g>
      <line
        x1={y}
        y1={x1}
        x2={y}
        y2={x2}
        stroke="var(--muted-foreground)"
        strokeWidth="1"
        markerStart={`url(#${uidBase}-arrow-start)`}
        markerEnd={`url(#${uidBase}-arrow-end)`}
      />
      <text
        x={y - 8}
        y={(x1 + x2) / 2}
        textAnchor="middle"
        fontSize="12"
        fontWeight="500"
        fill="var(--muted-foreground)"
        transform={`rotate(-90 ${y - 8} ${(x1 + x2) / 2})`}
      >
        {label}
      </text>
    </g>
  )
}

function Ruler({ x0, pxPerInch, sheetW, y }: { x0: number; pxPerInch: number; sheetW: number; y: number }) {
  const ticks: number[] = []
  for (let i = 0; i <= sheetW; i += 12) ticks.push(i)
  if (ticks[ticks.length - 1] !== sheetW) ticks.push(sheetW)
  const labelEvery = 24

  return (
    <g>
      <line x1={x0} y1={y} x2={x0 + sheetW * pxPerInch} y2={y} stroke="var(--border)" strokeWidth="1" />
      {ticks.map((t) => (
        <g key={`ruler-${t}`}>
          <line x1={x0 + t * pxPerInch} y1={y} x2={x0 + t * pxPerInch} y2={y + 4} stroke="var(--border-strong)" strokeWidth="1" />
          {t % labelEvery === 0 && (
            <text x={x0 + t * pxPerInch} y={y + 15} textAnchor="middle" fontSize="11" fill="var(--faint)">
              {t}
            </text>
          )}
        </g>
      ))}
    </g>
  )
}
