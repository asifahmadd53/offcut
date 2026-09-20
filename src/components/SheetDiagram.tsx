import { chooseFreeLabel } from '@/lib/labelChoice'
import { cn } from '@/lib/utils'
import type { Block } from '@/lib/sheetView'

interface SheetDiagramProps {
  sheetW: number
  sheetH: number
  blocks: Block[]
  maxW?: number
  maxH?: number
}

interface Badge {
  letter: string
  dims: string
  top: number
}

/**
 * Draws a sheet to scale with pieces, leftovers and earlier cuts. Colour is never the only
 * signal (R15): every block carries a text label, and a block too small for text falls back
 * to a lettered dot placed just outside the sheet edge.
 */
export function SheetDiagram({ sheetW, sheetH, blocks, maxW = 144, maxH = 288 }: SheetDiagramProps) {
  const scale = Math.min(maxW / sheetW, maxH / sheetH)
  const outerW = sheetW * scale + 3
  const outerH = sheetH * scale + 3

  const badges: Badge[] = []
  const pieceCount = blocks.filter((b) => b.kind === 'cut').length
  const leftoverCount = blocks.filter((b) => b.kind === 'free' || b.kind === 'freeNew').length
  const ariaLabel = `Sheet ${sheetW} by ${sheetH} inches with ${pieceCount} pieces and ${leftoverCount} leftovers`

  return (
    <div
      role="img"
      aria-label={ariaLabel}
      className="relative flex-none border-[1.5px] border-border-stronger"
      style={{ width: outerW, height: outerH }}
    >
      {blocks.map((b, i) => {
        const pw = b.w * scale
        const ph = b.h * scale
        const left = b.x * scale
        const top = b.y * scale
        const style = { left, top, width: pw, height: ph }

        if (b.kind === 'cut') {
          const showTwoLine = pw >= 52 && ph >= 34
          const showOneLine = !showTwoLine && pw >= 36 && ph >= 16
          return (
            <div
              key={i}
              className="absolute box-border flex items-center justify-center border-hair border-accent-border bg-accent-bg text-center font-semibold text-accent-text"
              style={{ ...style, fontSize: showTwoLine ? 12 : 11 }}
            >
              {showTwoLine && (
                <span>
                  {b.label}
                  <br />
                  {b.rotated ? 'Turned' : `Piece ${b.n}`}
                </span>
              )}
              {showOneLine && <span>{b.label}</span>}
            </div>
          )
        }

        if (b.kind === 'earlier') {
          const showLabel = pw >= 44 && ph >= 24
          return (
            <div
              key={i}
              className="absolute box-border flex items-center justify-center border-hair border-border bg-muted text-center text-[11px] font-normal text-faint"
              style={style}
            >
              {showLabel && 'Already cut'}
            </div>
          )
        }

        // free, freeNew, focus — every block must show its size, not just its letter (R15).
        const kindClass =
          b.kind === 'focus'
            ? 'border-[1.5px] border-success-border bg-success-bg'
            : 'border border-dashed border-success-border bg-success-bg'
        const choice = chooseFreeLabel(b.letter ?? '', b.w, b.h, pw, ph)

        if (choice.kind === 'wide') {
          return (
            <div
              key={i}
              className={cn(
                'absolute box-border flex items-center justify-center text-center text-[12px] font-semibold text-success-text',
                kindClass,
              )}
              style={style}
            >
              {choice.letter} · {choice.dims} free
            </div>
          )
        }
        if (choice.kind === 'stacked') {
          return (
            <div
              key={i}
              className={cn(
                'absolute box-border flex items-center justify-center text-center text-[11px] font-semibold leading-tight text-success-text',
                kindClass,
              )}
              style={style}
            >
              <span>
                {choice.letter}
                <br />
                {choice.dims}
              </span>
            </div>
          )
        }
        if (choice.kind === 'vertical') {
          return (
            <div
              key={i}
              className={cn(
                'absolute box-border flex items-center justify-center overflow-hidden text-center text-[10px] font-semibold text-success-text',
                kindClass,
              )}
              style={style}
            >
              <span style={{ writingMode: 'vertical-rl' }}>
                {choice.letter} · {choice.dims}
              </span>
            </div>
          )
        }

        // Too small for any label: badge with a lettered dot + size just outside the sheet.
        const rawTop = Math.min(Math.max(top + ph / 2 - 10, 0), outerH - 20)
        const overlap = badges.some((bd) => Math.abs(bd.top - rawTop) < 20)
        const finalTop = overlap ? Math.min(rawTop + 22, outerH - 20) : rawTop
        badges.push({ letter: choice.letter, dims: choice.dims, top: finalTop })
        return (
          <div key={i} className={cn('absolute box-border', kindClass)} style={style} />
        )
      })}

      {badges.map((bd, i) => (
        <div
          key={`badge-${i}`}
          className="absolute flex h-5 w-5 items-center justify-center rounded-full bg-success-bg text-[11px] font-bold text-success-text"
          style={{ left: outerW + 6, top: bd.top }}
          title={`${bd.letter}: ${bd.dims}`}
        >
          {bd.letter}
        </div>
      ))}
    </div>
  )
}
