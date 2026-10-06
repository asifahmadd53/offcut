import { cn } from '@/lib/utils'
import { cleanTape, describeSides, hasTape, tapeTotal, TAPE_SIDES } from '@/lib/tape'
import { sizeFormatter } from '@/lib/inches'
import type { EdgeTape, TapeSide } from '@/lib/types'
import type { CSSProperties } from 'react'

interface EdgeTapePickerProps {
  value: EdgeTape
  onChange: (tape: EdgeTape) => void
  /** The piece's typed width and height, shown on the picture and on the edges when known. */
  widthText?: string
  heightText?: string
  /** Numeric sizes: the tape length, and "Long sides" / "Short sides". */
  w?: number | null
  h?: number | null
}

const NAME: Record<TapeSide, string> = { top: 'Top edge', right: 'Right edge', bottom: 'Bottom edge', left: 'Left edge' }

const PICTURE_W = 200
/** The piece picture is always the same size, whatever sizes were typed. */
const PICTURE_H = 170
const BAND = 12
const PAD = 8

const GRID: CSSProperties = {
  backgroundImage: 'linear-gradient(var(--dg-grid) 1px, transparent 1px), linear-gradient(90deg, var(--dg-grid) 1px, transparent 1px)',
  backgroundSize: '16px 16px',
}

/**
 * Edge tape for one piece, as a drafting-board card: the piece drawn in the middle (always the
 * same size), with a tape band in the primary colour on every side that gets tape, and one pill
 * per edge around it ("TOP EDGE: 22.5"" with a TAPED or RAW badge). Tap a pill to switch that
 * edge. A taped edge is never colour alone: it says TAPED, its band is dotted and its pill is filled.
 */
export function EdgeTapePicker({ value, onChange, widthText, heightText, w, h }: EdgeTapePickerProps) {
  const toggle = (side: TapeSide) => onChange({ ...value, [side]: !value[side] })
  const known = typeof w === 'number' && typeof h === 'number' && w > 0 && h > 0

  const pictureH = PICTURE_H
  const lengthText = (side: TapeSide) => (side === 'top' || side === 'bottom' ? widthText : heightText)

  const pill = (side: TapeSide, className: string, vertical = false, flip = false) => {
    const on = !!value[side]
    const len = lengthText(side)
    const dot = <span key="dot" aria-hidden="true" className={cn('h-2 w-2 flex-none rounded-full', on ? 'bg-brand' : 'bg-faint')} />
    // On the side pills only the words turn (up the left pill, down the right); the dot and the badge stay upright and readable.
    const text = (
      <span key="text" className={cn('whitespace-nowrap', vertical && '[writing-mode:vertical-rl]', flip && 'rotate-180')}>
        {NAME[side]}
        {len ? `: ${len}"` : ''}
      </span>
    )
    const badge = (
      <span
        key="badge"
        className={cn('flex-none rounded px-1 py-0.5 text-[9px] font-extrabold tracking-wide', on ? 'bg-brand text-brand-fg' : 'bg-muted text-muted-foreground')}
      >
        {on ? 'TAPED' : 'RAW'}
      </span>
    )
    return (
      <button
        type="button"
        aria-pressed={on}
        aria-label={`${NAME[side]}${len ? `, ${len} inches` : ''}${on ? ', has tape' : ', no tape'}`}
        onClick={() => toggle(side)}
        className={cn(
          'flex min-w-0 items-center justify-center gap-2 rounded-lg border px-2 font-mono text-[10px] font-bold uppercase tracking-wide transition-transform active:scale-[0.97] sm:text-[11px]',
          vertical ? 'w-11 flex-col px-1 py-3' : 'h-11',
          on ? 'border-brand bg-brand-tint text-brand-ink' : 'border-border-strong bg-card text-muted-foreground hover:bg-muted',
          className,
        )}
      >
        {[dot, text, badge]}
      </button>
    )
  }

  const longSides: TapeSide[] = known && w! >= h! ? ['top', 'bottom'] : ['left', 'right']
  const shortSides: TapeSide[] = known && w! >= h! ? ['left', 'right'] : ['top', 'bottom']
  const set = (sides: TapeSide[]) => onChange(cleanTape(Object.fromEntries(sides.map((s) => [s, true]))) ?? {})

  const chip = (label: string, onClick: () => void, active = false) => (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'min-h-[30px] rounded-full border px-4 text-[13px] font-semibold active:scale-[0.98]',
        active ? 'border-brand bg-brand-tint text-brand-ink' : 'border-border-strong text-foreground hover:bg-muted',
      )}
    >
      {label}
    </button>
  )

  const total = known && hasTape(value) ? tapeTotal(w!, h!, value) : null
  const fmt = sizeFormatter('decimal').fmt

  return (
    <div className="mx-auto w-full  rounded-lg border-hair border-border bg-card p-3" style={GRID}>
      <div className="mx-auto grid w-full max-w-[320px] grid-cols-[44px_minmax(0,1fr)_44px] grid-rows-[auto_auto_auto] items-stretch gap-2">
        {pill('top', 'col-span-3 col-start-1 row-start-1')}
        {pill('left', 'col-start-1 row-start-2', true, true)}
        <svg
          className="col-start-2 row-start-2 h-auto w-full max-w-[200px] justify-self-center"
          viewBox={`0 0 ${PICTURE_W} ${pictureH}`}
          role="img"
          aria-label={hasTape(value) ? `Piece with tape on ${describeSides(value)}` : 'Piece with no tape'}
        >
          <rect x={PAD} y={PAD} width={PICTURE_W - 2 * PAD} height={pictureH - 2 * PAD} rx="4" fill="var(--muted)" stroke="var(--border-strong)" strokeWidth="1.5" />
          {value.top && <Band x={PAD} y={PAD} w={PICTURE_W - 2 * PAD} h={BAND} />}
          {value.bottom && <Band x={PAD} y={pictureH - PAD - BAND} w={PICTURE_W - 2 * PAD} h={BAND} />}
          {value.left && <Band x={PAD} y={PAD} w={BAND} h={pictureH - 2 * PAD} />}
          {value.right && <Band x={PICTURE_W - PAD - BAND} y={PAD} w={BAND} h={pictureH - 2 * PAD} />}
          <text x={PICTURE_W / 2} y={pictureH / 2 - 4} textAnchor="middle" fontSize="15" fontWeight="800" fill="var(--foreground)">
            This piece
          </text>
          <text x={PICTURE_W / 2} y={pictureH / 2 + 14} textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--muted-foreground)">
            {widthText && heightText ? `${widthText} × ${heightText} in` : 'width × height, inches'}
          </text>
        </svg>
        {pill('right', 'col-start-3 row-start-2', true)}
        {pill('bottom', 'col-span-3 col-start-1 row-start-3')}
      </div>

      <p className="mt-3 text-center text-[14px] font-semibold" aria-live="polite">
        {hasTape(value) ? `Tape on ${describeSides(value)}${total !== null ? ` · ${fmt(total)} in per piece` : ''}` : 'No tape on this piece'}
      </p>

      <div className="mt-2 flex flex-wrap justify-center gap-2">
        {chip('No tape', () => onChange({}), !hasTape(value))}
        {chip('All 4 sides', () => set(TAPE_SIDES), TAPE_SIDES.every((s) => value[s]))}
        {known && chip('Long sides', () => set(longSides))}
        {known && chip('Short sides', () => set(shortSides))}
      </div>
    </div>
  )
}

/** A tape band in the primary colour with a dotted line down its middle, as on the sheet drawing. */
function Band({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const horizontal = w >= h
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill="var(--dg-tape)" />
      <line
        x1={horizontal ? x + 3 : x + w / 2}
        y1={horizontal ? y + h / 2 : y + 3}
        x2={horizontal ? x + w - 3 : x + w / 2}
        y2={horizontal ? y + h / 2 : y + h - 3}
        stroke="var(--dg-tape-ink)"
        strokeWidth="2.5"
        strokeDasharray="0.1 6"
        strokeLinecap="round"
      />
    </g>
  )
}
