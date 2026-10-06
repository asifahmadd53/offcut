import { cn } from '@/lib/utils'
import { cleanTape, describeSides, hasTape, TAPE_SIDES } from '@/lib/tape'
import type { EdgeTape, TapeSide } from '@/lib/types'
import type { CSSProperties } from 'react'

interface EdgeTapePickerProps {
  value: EdgeTape
  onChange: (tape: EdgeTape) => void
  /** The piece's typed width and height, shown inside the picture when known. */
  widthText?: string
  heightText?: string
  /** Numeric sizes, only used to offer "Long sides" / "Short sides". */
  w?: number | null
  h?: number | null
}

const LABEL: Record<TapeSide, string> = { top: 'Top', right: 'Right', bottom: 'Bottom', left: 'Left' }

/**
 * A little picture of a piece with four tappable sides. A side that gets tape is drawn dotted
 * and says "Tape" (never just a colour); the other sides are plain. Used when adding a piece
 * and when changing the tape of a piece already in the job.
 */
export function EdgeTapePicker({ value, onChange, widthText, heightText, w, h }: EdgeTapePickerProps) {
  const toggle = (side: TapeSide) => onChange({ ...value, [side]: !value[side] })

  const edgeStyle = (side: TapeSide): CSSProperties => {
    const key = `border${LABEL[side]}` as 'borderTop' | 'borderRight' | 'borderBottom' | 'borderLeft'
    return value[side]
      ? { [`${key}Style`]: 'dotted', [`${key}Width`]: 4, [`${key}Color`]: 'var(--accent-text)' }
      : { [`${key}Style`]: 'solid', [`${key}Width`]: 1, [`${key}Color`]: 'var(--border-strong)' }
  }

  const sideButton = (side: TapeSide, className: string) => (
    <button
      type="button"
      aria-pressed={!!value[side]}
      aria-label={`${LABEL[side]} side${value[side] ? ', has tape' : ', no tape'}`}
      onClick={() => toggle(side)}
      className={cn(
        'flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border-hair text-[12px] font-semibold transition-colors active:scale-[0.98]',
        value[side]
          ? 'border-accent-border bg-accent-bg text-accent-text'
          : 'border-border bg-card text-muted-foreground hover:bg-muted',
        className,
      )}
    >
      {value[side] ? 'Tape' : LABEL[side]}
    </button>
  )

  const known = typeof w === 'number' && typeof h === 'number' && w > 0 && h > 0
  const longSides: TapeSide[] = known && w! >= h! ? ['top', 'bottom'] : ['left', 'right']
  const shortSides: TapeSide[] = known && w! >= h! ? ['left', 'right'] : ['top', 'bottom']
  const set = (sides: TapeSide[]) => onChange(cleanTape(Object.fromEntries(sides.map((s) => [s, true]))) ?? {})

  const chip = (label: string, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      className="min-h-[36px] rounded-full border-hair border-border-strong px-3 text-[13px] text-foreground hover:bg-muted active:scale-[0.98]"
    >
      {label}
    </button>
  )

  return (
    <div>
      <div className="mx-auto grid w-full max-w-[320px] grid-cols-[64px_1fr_64px] grid-rows-[44px_auto_44px] gap-1.5">
        {sideButton('top', 'col-start-2 row-start-1')}
        {sideButton('left', 'col-start-1 row-start-2')}
        <div
          className="col-start-2 row-start-2 flex min-h-[104px] flex-col items-center justify-center rounded-sm bg-accent-bg px-2 py-3 text-center"
          style={{ ...edgeStyle('top'), ...edgeStyle('right'), ...edgeStyle('bottom'), ...edgeStyle('left') }}
        >
          <span className="text-[15px] font-semibold text-accent-text">
            {widthText && heightText ? `${widthText} × ${heightText}` : 'This piece'}
          </span>
          <span className="mt-0.5 text-[12px] text-muted-foreground">
            {hasTape(value) ? `Dotted = tape on ${describeSides(value)}` : 'No tape'}
          </span>
        </div>
        {sideButton('right', 'col-start-3 row-start-2')}
        {sideButton('bottom', 'col-start-2 row-start-3')}
      </div>

      <div className="mt-3 flex flex-wrap justify-center gap-2">
        {chip('No tape', () => onChange({}))}
        {chip('All 4 sides', () => set(TAPE_SIDES))}
        {known && chip('Long sides', () => set(longSides))}
        {known && chip('Short sides', () => set(shortSides))}
      </div>
    </div>
  )
}
