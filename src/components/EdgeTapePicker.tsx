import { cn } from '@/lib/utils'
import { cleanTape, describeSides, hasTape, tapeTotal, TAPE_SIDES } from '@/lib/tape'
import { sizeFormatter } from '@/lib/inches'
import type { EdgeTape, TapeSide } from '@/lib/types'

interface EdgeTapePickerProps {
  value: EdgeTape
  onChange: (tape: EdgeTape) => void
  /** The piece's typed width and height, shown on the picture and on the sides when known. */
  widthText?: string
  heightText?: string
  /** Numeric sizes: the picture's proportions, the tape length, and "Long sides" / "Short sides". */
  w?: number | null
  h?: number | null
}

const LABEL: Record<TapeSide, string> = { top: 'Top', right: 'Right', bottom: 'Bottom', left: 'Left' }

const PICTURE_W = 200
const BAND = 12
const PAD = 8

/**
 * Edge tape for one piece: a picture of the piece, drawn to its proportions, with a tape strip
 * on each side you tap. A taped side is a yellow band with a dotted line and the word "TAPE"
 * (the same look as on the sheet drawing and the PDF), a plain side says "Tap to add" — never
 * just a colour. Used when adding a piece and when changing the tape of one already in the job.
 */
export function EdgeTapePicker({ value, onChange, widthText, heightText, w, h }: EdgeTapePickerProps) {
  const toggle = (side: TapeSide) => onChange({ ...value, [side]: !value[side] })
  const known = typeof w === 'number' && typeof h === 'number' && w > 0 && h > 0

  const ratio = known ? Math.min(1.1, Math.max(0.55, h! / w!)) : 0.7
  const pictureH = Math.round(PICTURE_W * ratio)
  const lengthText = (side: TapeSide) => (side === 'top' || side === 'bottom' ? widthText : heightText)

  const strip = (side: TapeSide, className: string) => {
    const on = !!value[side]
    const len = lengthText(side)
    return (
      <button
        type="button"
        aria-pressed={on}
        aria-label={`${LABEL[side]} side${len ? `, ${len} inches` : ''}${on ? ', has tape' : ', no tape'}`}
        onClick={() => toggle(side)}
        className={cn(
          'flex min-h-[48px] min-w-[48px] flex-col items-center justify-center rounded-md px-1 text-center transition-transform active:scale-[0.97]',
          on ? 'text-[12px] font-extrabold tracking-wide' : 'border border-dashed border-border-strong bg-card text-[12px] font-semibold text-muted-foreground hover:bg-muted',
          className,
        )}
        style={on ? { background: 'var(--dg-tape)', color: 'var(--dg-tape-ink)' } : undefined}
      >
        <span>{on ? 'TAPE' : `+ ${LABEL[side]}`}</span>
        {on && <span aria-hidden="true" className="my-0.5 block h-0 w-9 border-t-[3px] border-dotted" style={{ borderColor: 'var(--dg-tape-ink)' }} />}
        {len && <span className={cn('text-[11px]', on ? 'font-semibold' : 'font-normal')}>{len} in</span>}
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
        'min-h-[40px] rounded-full border px-4 text-[13px] font-semibold active:scale-[0.98]',
        active ? 'border-accent-border bg-accent-bg text-accent-text' : 'border-border-strong text-foreground hover:bg-muted',
      )}
    >
      {label}
    </button>
  )

  const total = known && hasTape(value) ? tapeTotal(w!, h!, value) : null
  const fmt = sizeFormatter('decimal').fmt

  return (
    <div>
      <div className="mx-auto grid w-full max-w-[360px] grid-cols-[76px_1fr_76px] grid-rows-[auto_auto_auto] items-stretch gap-2">
        {strip('top', 'col-start-2 row-start-1')}
        {strip('left', 'col-start-1 row-start-2')}
        <svg
          className="col-start-2 row-start-2 h-auto w-full"
          viewBox={`0 0 ${PICTURE_W} ${pictureH}`}
          role="img"
          aria-label={hasTape(value) ? `Piece with tape on ${describeSides(value)}` : 'Piece with no tape'}
        >
          <rect x={PAD} y={PAD} width={PICTURE_W - 2 * PAD} height={pictureH - 2 * PAD} rx="3" fill="var(--accent-bg)" stroke="var(--border-strong)" strokeWidth="1.5" />
          {value.top && <Band x={PAD} y={PAD} w={PICTURE_W - 2 * PAD} h={BAND} />}
          {value.bottom && <Band x={PAD} y={pictureH - PAD - BAND} w={PICTURE_W - 2 * PAD} h={BAND} />}
          {value.left && <Band x={PAD} y={PAD} w={BAND} h={pictureH - 2 * PAD} />}
          {value.right && <Band x={PICTURE_W - PAD - BAND} y={PAD} w={BAND} h={pictureH - 2 * PAD} />}
          <text x={PICTURE_W / 2} y={pictureH / 2 - 2} textAnchor="middle" fontSize="15" fontWeight="700" fill="var(--accent-text)">
            {widthText && heightText ? `${widthText} × ${heightText}` : 'This piece'}
          </text>
          <text x={PICTURE_W / 2} y={pictureH / 2 + 16} textAnchor="middle" fontSize="11" fill="var(--muted-foreground)">
            width × height, inches
          </text>
        </svg>
        {strip('right', 'col-start-3 row-start-2')}
        {strip('bottom', 'col-start-2 row-start-3')}
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

/** A yellow tape band with a dotted line down its middle, as on the sheet drawing. */
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
