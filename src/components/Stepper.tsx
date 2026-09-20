import { IconMinus, IconPlus } from '@tabler/icons-react'
import { cn } from '@/lib/utils'

interface StepperProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
}

export function Stepper({ value, onChange, min = 1, max = 99 }: StepperProps) {
  const dec = () => onChange(Math.max(min, value - 1))
  const inc = () => onChange(Math.min(max, value + 1))

  return (
    <div className="flex items-center justify-between rounded-lg border-hair border-border-strong px-1 py-1">
      <button
        type="button"
        onClick={dec}
        disabled={value <= min}
        aria-label="Fewer pieces"
        className={cn(
          'flex h-11 w-11 items-center justify-center rounded-lg text-foreground transition-colors active:scale-[0.98] disabled:opacity-30',
          value > min && 'hover:bg-muted',
        )}
      >
        <IconMinus size={18} />
      </button>
      <input
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value.replace(/[^0-9]/g, ''))
          if (!Number.isNaN(n)) onChange(Math.min(max, Math.max(min, n || min)))
        }}
        className="w-12 flex-none bg-transparent text-center text-[22px] font-semibold text-foreground focus-visible:outline-none"
        aria-label="How many pieces"
      />
      <button
        type="button"
        onClick={inc}
        disabled={value >= max}
        aria-label="More pieces"
        className={cn(
          'flex h-11 w-11 items-center justify-center rounded-lg text-foreground transition-colors active:scale-[0.98] disabled:opacity-30',
          value < max && 'hover:bg-muted',
        )}
      >
        <IconPlus size={18} />
      </button>
    </div>
  )
}
