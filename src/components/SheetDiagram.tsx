import { useEffect, useMemo, useRef, useState } from 'react'
import { badgePositions, chooseAllLabels, diagramAriaLabel, type CutLineLayout } from '@/lib/diagramLayout'
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
  /** Print pages draw every cut line, thin and numbered; the screen draws only the active one. */
  showAllCutLines?: boolean
}

const MARGIN = 12

/**
 * Draws a sheet plainly: the outline and filled blocks, each with at most one label (or a
 * small badge when too small). Colour meaning: blue = pieces, green = saved leftovers,
 * grey = earlier cuts. No dimension lines, no ruler, no hatching, no rotated text — every
 * block's size is either on the block or in the Sizes list shown below the drawing.
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
  showAllCutLines = false,
}: SheetDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerW, setContainerW] = useState(maxW)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w && w > 0) setContainerW(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const layout = useMemo(() => {
    const availW = Math.max(containerW, 20)
    const pxPerInch = Math.min(availW / sheetW, maxH / sheetH)
    const sheetPxW = sheetW * pxPerInch
    const sheetPxH = sheetH * pxPerInch
    const svgW = sheetPxW + MARGIN * 2
    const svgH = sheetPxH + MARGIN * 2

    const labels = chooseAllLabels(blocks, pxPerInch)
    const badges = badgePositions(blocks)
    const cutLines: CutLineLayout[] = showAllCutLines
      ? (cuts ?? [])
      : cuts && activeCut != null
        ? cuts.filter((c) => c.n === activeCut)
        : []

    return { pxPerInch, sheetPxW, sheetPxH, svgW, svgH, labels, badges, cutLines }
  }, [blocks, containerW, cuts, activeCut, showAllCutLines, maxH, sheetH, sheetW])

  const { pxPerInch, sheetPxW, sheetPxH, svgW, svgH, labels, badges, cutLines } = layout

  const pieceCount = blocks.filter((b) => b.kind === 'cut').length
  const leftoverCount = blocks.filter((b) => b.kind === 'free' || b.kind === 'freeNew' || b.kind === 'focus').length
  const ariaLabel = diagramAriaLabel(sheetW, sheetH, pieceCount, leftoverCount, cuts ? cuts.length : undefined)

  const X = (inX: number) => MARGIN + inX * pxPerInch
  const Y = (inY: number) => MARGIN + inY * pxPerInch

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
    if (b.kind === 'earlier' || b.kind === 'waste') return 'var(--border)'
    return 'var(--success-border)'
  }
  function textFor(b: Block): string {
    if (b.kind === 'cut') return 'var(--accent-text)'
    if (b.kind === 'earlier' || b.kind === 'waste') return 'var(--muted-foreground)'
    return 'var(--success-text)'
  }

  return (
    <div ref={containerRef} className="w-full" style={{ maxWidth: maxW }}>
      <svg
        role="img"
        aria-label={ariaLabel}
        viewBox={`0 0 ${svgW} ${svgH}`}
        width={svgW}
        height={svgH}
        className="max-w-full font-sans"
      >
        {blocks.map((b, i) => {
          const pw = b.w * pxPerInch
          const ph = b.h * pxPerInch
          const label = labels[i]
          const isLeftoverBlock = b.kind === 'free' || b.kind === 'freeNew' || b.kind === 'focus'
          const isFocus = b.kind === 'focus'
          const strokeW = isFocus ? 1.5 : 1
          const dashed = isLeftoverBlock && !isFocus
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
              {label.kind === 'inline' && !label.line2 && (
                <text
                  x={cx}
                  y={cy}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize="12"
                  fontWeight="600"
                  fill={textFor(b)}
                >
                  {label.line1}
                </text>
              )}
              {label.kind === 'inline' && label.line2 && (
                <>
                  <text x={cx} y={cy - 7} textAnchor="middle" fontSize="12" fontWeight="600" fill={textFor(b)}>
                    {label.line1}
                  </text>
                  <text x={cx} y={cy + 8} textAnchor="middle" fontSize="12" fontWeight="600" fill={textFor(b)}>
                    {label.line2}
                  </text>
                </>
              )}
              {label.kind === 'badge' && label.line1 && (
                <BlockBadge
                  cx={badges[i].cx * pxPerInch + MARGIN}
                  cy={badges[i].cy * pxPerInch + MARGIN}
                  text={label.line1}
                  stroke={strokeFor(b)}
                  textColor={textFor(b)}
                />
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

        {/* Cut lines: print pages draw all of them, thin and numbered; the screen draws
            only the step the user tapped, thick and highlighted. */}
        {cutLines.map((c) => {
          const isActive = activeCut === c.n
          const strokeWidth = showAllCutLines ? 1 : isActive ? 2.5 : 1
          if (c.kind === 'across') {
            const y = Y(c.pos)
            const x1 = X(c.from) - 8
            const x2 = X(c.to) + 8
            return (
              <g key={`cut-${c.n}`}>
                <line x1={x1} y1={y} x2={x2} y2={y} stroke="var(--foreground)" strokeWidth={strokeWidth} strokeDasharray="6 4" />
                <CutNumber cx={x2 + 12} cy={y} n={c.n} interactive={!showAllCutLines} active={isActive} onToggle={() => toggleCut(c.n)} />
              </g>
            )
          }
          const x = X(c.pos)
          const y1 = Y(c.from) - 8
          const y2 = Y(c.to) + 8
          return (
            <g key={`cut-${c.n}`}>
              <line x1={x} y1={y1} x2={x} y2={y2} stroke="var(--foreground)" strokeWidth={strokeWidth} strokeDasharray="6 4" />
              <CutNumber cx={x} cy={y1 - 12} n={c.n} interactive={!showAllCutLines} active={isActive} onToggle={() => toggleCut(c.n)} />
            </g>
          )
        })}
      </svg>
    </div>
  )
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

function CutNumber({
  cx,
  cy,
  n,
  interactive,
  active,
  onToggle,
}: {
  cx: number
  cy: number
  n: number
  interactive: boolean
  active: boolean
  onToggle: () => void
}) {
  const size = interactive ? 9 : 6
  const fontSize = interactive ? 11 : 9
  if (!interactive) {
    return (
      <g>
        <circle cx={cx} cy={cy} r={size} fill="var(--background)" stroke="var(--foreground)" strokeWidth="1" />
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fontSize={fontSize} fontWeight="600" fill="var(--foreground)">
          {n}
        </text>
      </g>
    )
  }
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
      {/* Generous invisible hit target keeps the >=44px tap-target rule without changing the drawn circle's size. */}
      <circle cx={cx} cy={cy} r="22" fill="transparent" />
      <circle cx={cx} cy={cy} r={size} fill={active ? 'var(--accent-text)' : 'var(--background)'} stroke="var(--foreground)" strokeWidth="1.25" />
      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fontSize={fontSize} fontWeight="600" fill={active ? 'var(--background)' : 'var(--foreground)'}>
        {n}
      </text>
    </g>
  )
}
