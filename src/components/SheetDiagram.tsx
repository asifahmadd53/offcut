import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  buildSizesList,
  estimateTextWidth,
  planCallouts,
  planDimensionSegments,
  planInlineLabels,
  resolveLabelOverlaps,
  type Measure,
} from '@/lib/diagramLabels'
import { computeWasteCells, diagramAriaLabel, wasteLabelFits, type CutLineLayout } from '@/lib/diagramLayout'
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
   * When true, the diagram measures and fills its container's actual width AND height
   * (up to maxW/maxH as an outer ceiling) instead of staying a small fixed-size picture.
   * The caller must give the container a real CSS height for this to have any effect —
   * used by Plan/Job detail's main (non-fullscreen, non-compact) drawing on wide screens.
   * Leftover detail's intentionally compact preview leaves this off.
   */
  fill?: boolean
  /** Called once per render with the block-by-block Sizes list, so the caller (PlanSheet,
   *  Leftover detail) can show it as real HTML text beside/under the drawing. */
  onSizesList?: (list: ReturnType<typeof buildSizesList>) => void
}

const LEFT_MARGIN = 90
const TOP_MARGIN = 64
const RIGHT_MARGIN = 96
const BOTTOM_MARGIN = 32

/** A hidden SVG <text> used purely to measure real rendered text width once the page's
 *  font has loaded, so label-fitting matches pixel-for-pixel what's actually drawn. */
function useTextMeasurer(): Measure {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const textRef = useRef<SVGTextElement | null>(null)
  const cache = useRef(new Map<string, number>())
  // The measurer is only usable once the effect below has mounted the hidden SVG; this
  // flag's identity change is what forces layout's useMemo to redo the fit with real
  // measurements instead of silently keeping the very first render's rough estimate.
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('width', '0')
    svg.setAttribute('height', '0')
    svg.style.position = 'absolute'
    svg.style.visibility = 'hidden'
    svg.style.pointerEvents = 'none'
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    text.setAttribute('font-family', 'inherit')
    svg.appendChild(text)
    document.body.appendChild(svg)
    svgRef.current = svg
    textRef.current = text
    setReady(true)
    return () => {
      document.body.removeChild(svg)
      svgRef.current = null
      textRef.current = null
    }
  }, [])

  return useMemo(() => {
    const measure: Measure = (text, fontSize) => {
      const key = `${fontSize}|${text}`
      const cached = cache.current.get(key)
      if (cached !== undefined) return cached
      const el = textRef.current
      if (!el) return estimateTextWidth(text, fontSize)
      el.setAttribute('font-size', String(fontSize))
      el.setAttribute('font-weight', '600')
      el.textContent = text
      let w: number
      try {
        w = el.getBBox().width
      } catch {
        w = estimateTextWidth(text, fontSize)
      }
      if (w <= 0) w = estimateTextWidth(text, fontSize)
      cache.current.set(key, w)
      return w
    }
    return measure
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready])
}

/**
 * Draws a sheet as a technical/engineering-style cutting drawing: outline, pieces,
 * hatched leftovers and waste, numbered dashed cut lines, and dimension lines with
 * tick marks. Every block's label is fitted to its own block (real text measurement,
 * largest font 13-11px that fits, falling back to a badge, per lib/diagramLabels.ts) so
 * text never overflows a block or overlaps a neighbour. Colour is never the only signal
 * (R15): every block carries text or a letter, and a dashed border independently marks
 * a leftover.
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
  fill = false,
  onSizesList,
}: SheetDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerW, setContainerW] = useState(maxW + LEFT_MARGIN + RIGHT_MARGIN)
  const [containerH, setContainerH] = useState(maxH + TOP_MARGIN + BOTTOM_MARGIN + 28)
  const uidBase = useId()
  const measure = useTextMeasurer()

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
    const svgH = TOP_MARGIN + sheetPxH + BOTTOM_MARGIN + 28 // + ruler strip

    const region = { x: 0, y: 0, w: sheetW, h: sheetH }
    const wasteCells = computeWasteCells(blocks, region)
    const cutLines: CutLineLayout[] = cuts ?? []

    // Dimension edges from pieces + leftovers only (not waste/earlier).
    const dimBlocks = blocks.filter((b) => b.kind === 'cut' || b.kind === 'free' || b.kind === 'freeNew' || b.kind === 'focus')
    const xEdgeSet = new Set<number>([0, sheetW])
    const yEdgeSet = new Set<number>([0, sheetH])
    for (const b of dimBlocks) {
      xEdgeSet.add(b.x)
      xEdgeSet.add(b.x + b.w)
      yEdgeSet.add(b.y)
      yEdgeSet.add(b.y + b.h)
    }
    const xEdges = [...xEdgeSet].sort((a, b) => a - b)
    const yEdges = [...yEdgeSet].sort((a, b) => a - b)
    const xSegs = planDimensionSegments(xEdges, pxPerInch, measure)
    const ySegs = planDimensionSegments(yEdges, pxPerInch, measure)

    // Block labels: fit inline at the largest font that fits (13->11px), or a badge.
    // Then resolve any remaining overlap — between two block labels, or a label and a
    // fixed obstacle like a dimension number — by demoting the smaller block first.
    const initial = planInlineLabels(blocks, pxPerInch, measure)
    const dimensionBoxes = [
      ...xSegs.map((s) => ({ x: LEFT_MARGIN + s.from * pxPerInch, y: TOP_MARGIN - 30, w: (s.to - s.from) * pxPerInch, h: 20 })),
      ...ySegs.map((s) => ({ x: LEFT_MARGIN - 60, y: TOP_MARGIN + s.from * pxPerInch, w: 40, h: (s.to - s.from) * pxPerInch })),
    ]
    const resolved = resolveLabelOverlaps(blocks, initial, dimensionBoxes)

    // At most 2 callouts, for the biggest blocks still without an inline label; the
    // rest go to the Sizes list instead of crowding the drawing with leader lines.
    const { callouts, promoted } = planCallouts(blocks, resolved, sheetPxW, 0, sheetPxH)
    const remainingBadgeIndices = resolved
      .map((l, i) => ({ l, i }))
      .filter(({ l, i }) => l.kind === 'badge' && !promoted.has(i))
      .map(({ i }) => i)
    const sizesList = buildSizesList(blocks, remainingBadgeIndices)

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
      labels: resolved,
      callouts,
      sizesList,
    }
  }, [blocks, containerW, containerH, cuts, fill, maxH, measure, sheetH, sheetW])

  const { pxPerInch, sheetPxW, sheetPxH, svgW, svgH, wasteCells, cutLines, xSegs, ySegs, labels, callouts, sizesList } = layout

  useEffect(() => {
    onSizesList?.(sizesList)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sizesList])

  const pieceCount = blocks.filter((b) => b.kind === 'cut').length
  const leftoverCount = blocks.filter((b) => b.kind === 'free' || b.kind === 'freeNew' || b.kind === 'focus').length
  const ariaLabel = diagramAriaLabel(sheetW, sheetH, pieceCount, leftoverCount, cuts ? cuts.length : undefined)

  const X = (inX: number) => LEFT_MARGIN + inX * pxPerInch
  const Y = (inY: number) => TOP_MARGIN + inY * pxPerInch

  function toggleCut(n: number) {
    onCutToggle?.(n)
  }

  function fillFor(b: Block): string {
    if (b.kind === 'cut') return 'var(--accent-bg)'
    if (b.kind === 'earlier' || b.kind === 'waste') return 'var(--muted)'
    return 'var(--success-bg)' // free / freeNew / focus
  }
  function strokeFor(b: Block): string {
    if (b.kind === 'cut') return 'var(--accent-border)'
    if (b.kind === 'earlier' || b.kind === 'waste') return 'var(--border-strong)'
    return 'var(--success-border)'
  }
  function textFor(b: Block): string {
    if (b.kind === 'cut') return 'var(--accent-text)'
    if (b.kind === 'earlier' || b.kind === 'waste') return 'var(--muted-foreground)'
    return 'var(--success-text)'
  }

  return (
    <div
      ref={containerRef}
      className={fill ? 'h-full w-full' : 'w-full'}
      style={fill ? undefined : { maxWidth: maxW + LEFT_MARGIN + RIGHT_MARGIN }}
    >
      <svg
        role="img"
        aria-label={ariaLabel}
        viewBox={`0 0 ${svgW} ${svgH}`}
        width={svgW}
        height={svgH}
        className="max-w-full font-sans"
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
              <rect x={X(c.x)} y={Y(c.y)} width={pw} height={ph} fill={`url(#${uidBase}-hatch-waste)`} stroke="var(--border-strong)" strokeWidth="1" />
              {showLabel && (
                <text x={X(c.x) + pw / 2} y={Y(c.y) + ph / 2} textAnchor="middle" dominantBaseline="middle" fontSize="11" fill="var(--muted-foreground)">
                  Waste
                </text>
              )}
            </g>
          )
        })}

        {/* Every block: outline plus its planned label (inline, two-line, or a badge). */}
        {blocks.map((b, i) => {
          const pw = b.w * pxPerInch
          const ph = b.h * pxPerInch
          const isLeftoverBlock = b.kind === 'free' || b.kind === 'freeNew' || b.kind === 'focus'
          const isFocus = b.kind === 'focus'
          const strokeW = isFocus ? 1.5 : 1
          const dashed = isLeftoverBlock && !isFocus
          const label = labels[i]
          const cx = X(b.x) + pw / 2
          const cy = Y(b.y) + ph / 2
          return (
            <g key={i}>
              <rect
                x={X(b.x)}
                y={Y(b.y)}
                width={pw}
                height={ph}
                fill={fillFor(b)}
                stroke={strokeFor(b)}
                strokeWidth={strokeW}
                strokeDasharray={dashed ? '4 3' : undefined}
              />
              {isLeftoverBlock && <rect x={X(b.x)} y={Y(b.y)} width={pw} height={ph} fill={`url(#${uidBase}-hatch-leftover)`} />}
              {(label.kind === 'inline-one-line' || label.kind === 'inline-two-line') &&
                label.lines.map((line, li) => (
                  <text
                    key={li}
                    x={cx}
                    y={label.lines.length === 1 ? cy : cy + (li === 0 ? -label.fontSize * 0.5 : label.fontSize * 0.7)}
                    textAnchor="middle"
                    dominantBaseline={label.lines.length === 1 ? 'middle' : undefined}
                    fontSize={label.fontSize}
                    fontWeight="600"
                    fill={textFor(b)}
                  >
                    {line}
                  </text>
                ))}
              {label.kind === 'badge' && (
                <BlockBadge cx={label.box.x + label.box.w / 2} cy={label.box.y + label.box.h / 2} text={badgeTextFor(b)} stroke={strokeFor(b)} textColor={textFor(b)} />
              )}
            </g>
          )
        })}

        {/* At most 2 dotted callouts, for the biggest blocks that still had no room. */}
        {callouts.map((c) => {
          const kind = blocks[c.blockIndex]?.kind
          const color = kind === 'cut' ? 'var(--accent-text)' : kind === 'earlier' || kind === 'waste' ? 'var(--muted-foreground)' : 'var(--success-text)'
          const x1 = LEFT_MARGIN + c.fromX
          const y1 = TOP_MARGIN + c.fromY
          const x2 = LEFT_MARGIN + c.toX
          const y2 = TOP_MARGIN + c.toY
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

        {/* Sheet outline, thick neutral stroke */}
        <rect x={X(0)} y={Y(0)} width={sheetPxW} height={sheetPxH} fill="none" stroke="var(--border-stronger)" strokeWidth="2" />

        {/* Numbered dashed cut lines */}
        {cutLines.map((c) => {
          const isActive = activeCut === c.n
          const stroke = 'var(--muted-foreground)'
          const strokeWidth = isActive ? 2.5 : 1
          const opacity = activeCut != null && !isActive ? 0.3 : isActive ? 1 : 0.75
          if (c.kind === 'across') {
            const y = Y(c.pos)
            const x1 = X(c.from) - 8
            const x2 = X(c.to) + 8
            return (
              <g key={`cut-line-${c.n}`}>
                <line x1={x1} y1={y} x2={x2} y2={y} stroke={stroke} strokeWidth={strokeWidth} strokeDasharray="6 4" opacity={opacity} />
                <CutCircle cx={x2 + 12} cy={y} n={c.n} active={isActive} onToggle={() => toggleCut(c.n)} />
              </g>
            )
          }
          const x = X(c.pos)
          const y1 = Y(c.from) - 8
          const y2 = Y(c.to) + 8
          const circleY = y1 - 4
          return (
            <g key={`cut-line-${c.n}`}>
              <line x1={x} y1={y1} x2={x} y2={y2} stroke={stroke} strokeWidth={strokeWidth} strokeDasharray="6 4" opacity={opacity} />
              <CutCircle cx={x} cy={circleY} n={c.n} active={isActive} onToggle={() => toggleCut(c.n)} />
            </g>
          )
        })}

        {/* Dimension lines: overall + segment ticks, top and left. Segments too narrow
            for their own number are merged with a neighbour or dropped (planDimensionSegments). */}
        <DimensionOverall x1={X(0)} x2={X(sheetW)} y={TOP_MARGIN - 40} label={String(sheetW)} orientation="horizontal" uidBase={uidBase} />
        <DimensionOverall x1={Y(0)} x2={Y(sheetH)} y={LEFT_MARGIN - 40} label={String(sheetH)} orientation="vertical" uidBase={uidBase} />

        <line x1={LEFT_MARGIN} y1={TOP_MARGIN - 18} x2={LEFT_MARGIN + sheetPxW} y2={TOP_MARGIN - 18} stroke="var(--border-strong)" strokeWidth="1" />
        {xSegs.map((s, i) => (
          <g key={`xseg-${i}`}>
            <line x1={X(s.from)} y1={TOP_MARGIN - 22} x2={X(s.from)} y2={TOP_MARGIN - 14} stroke="var(--border-strong)" strokeWidth="1" />
            <line x1={X(s.to)} y1={TOP_MARGIN - 22} x2={X(s.to)} y2={TOP_MARGIN - 14} stroke="var(--border-strong)" strokeWidth="1" />
            <text x={X((s.from + s.to) / 2)} y={TOP_MARGIN - 8} textAnchor="middle" fontSize="11" fill="var(--muted-foreground)">
              {s.label}
            </text>
          </g>
        ))}

        <line x1={LEFT_MARGIN - 18} y1={TOP_MARGIN} x2={LEFT_MARGIN - 18} y2={TOP_MARGIN + sheetPxH} stroke="var(--border-strong)" strokeWidth="1" />
        {ySegs.map((s, i) => (
          <g key={`yseg-${i}`}>
            <line x1={LEFT_MARGIN - 22} y1={Y(s.from)} x2={LEFT_MARGIN - 14} y2={Y(s.from)} stroke="var(--border-strong)" strokeWidth="1" />
            <line x1={LEFT_MARGIN - 22} y1={Y(s.to)} x2={LEFT_MARGIN - 14} y2={Y(s.to)} stroke="var(--border-strong)" strokeWidth="1" />
            <text x={LEFT_MARGIN - 26} y={Y((s.from + s.to) / 2)} textAnchor="end" dominantBaseline="middle" fontSize="11" fill="var(--muted-foreground)">
              {s.label}
            </text>
          </g>
        ))}

        {/* Ruler along the bottom edge: ticks every 12 in, labels at 0/24/48-style intervals */}
        <Ruler x0={X(0)} pxPerInch={pxPerInch} sheetW={sheetW} y={TOP_MARGIN + sheetPxH + 10} />
      </svg>
    </div>
  )
}

function badgeTextFor(b: Block): string {
  if (b.kind === 'cut') return b.n != null ? String(b.n) : '?'
  if (b.kind === 'earlier' || b.kind === 'waste') return b.n != null ? String(b.n) : '•'
  return b.letter ?? '?'
}

/** A small badge on a block too small for its label: a number for pieces/earlier, a letter for leftovers. */
function BlockBadge({
  cx,
  cy,
  text,
  stroke,
  textColor,
}: {
  cx: number
  cy: number
  text: string
  stroke: string
  textColor: string
}) {
  return (
    <g>
      <circle cx={cx} cy={cy} r="8" fill="var(--background)" stroke={stroke} strokeWidth="1" />
      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fontSize="10" fontWeight="700" fill={textColor}>
        {text}
      </text>
    </g>
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
      <circle cx={cx} cy={cy} r="9" fill={active ? 'var(--accent-text)' : 'var(--background)'} stroke="var(--muted-foreground)" strokeWidth="1.25" />
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
        <line x1={x1} y1={y} x2={x2} y2={y} stroke="var(--muted-foreground)" strokeWidth="1" markerStart={`url(#${uidBase}-arrow-start)`} markerEnd={`url(#${uidBase}-arrow-end)`} />
        <text x={(x1 + x2) / 2} y={y - 6} textAnchor="middle" fontSize="12" fontWeight="500" fill="var(--muted-foreground)">
          {label}
        </text>
      </g>
    )
  }
  return (
    <g>
      <line x1={y} y1={x1} x2={y} y2={x2} stroke="var(--muted-foreground)" strokeWidth="1" markerStart={`url(#${uidBase}-arrow-start)`} markerEnd={`url(#${uidBase}-arrow-end)`} />
      <text x={y - 8} y={(x1 + x2) / 2} textAnchor="middle" fontSize="12" fontWeight="500" fill="var(--muted-foreground)" transform={`rotate(-90 ${y - 8} ${(x1 + x2) / 2})`}>
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
