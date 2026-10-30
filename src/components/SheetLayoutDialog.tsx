import { useEffect, useState } from 'react'
import { IconX } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { SheetLayout } from '@/lib/types'

interface SheetLayoutDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The layout shown when the dialog opens. */
  value: SheetLayout
  /** Called with the chosen layout when the user taps the main button. */
  onSave: (layout: SheetLayout) => void
  title?: string
  description?: string
  saveLabel?: string
}

/** A small picture of a sheet whose lines run top to bottom, or of a plain one. */
function GrainPicture({ grain }: { grain: boolean }) {
  return (
    <svg viewBox="0 0 24 34" width="24" height="34" aria-hidden="true" className="flex-none">
      <rect x="0.75" y="0.75" width="22.5" height="32.5" rx="2.5" fill="var(--accent-bg)" stroke="var(--accent-text)" strokeOpacity="0.7" strokeWidth="1.5" />
      {grain &&
        [6, 10, 14, 18].map((x) => (
          <line key={x} x1={x} y1="5" x2={x} y2="29" stroke="var(--accent-text)" strokeOpacity="0.75" strokeWidth="1.25" strokeLinecap="round" />
        ))}
    </svg>
  )
}

const choiceClass = (selected: boolean) =>
  cn(
    'flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors',
    selected ? 'border-accent-border bg-accent-bg' : 'border-border-strong bg-background hover:bg-muted',
  )

/**
 * The "Sheet layout" popup: whether the sheet has a grain. Used by Settings (the
 * default for new jobs) and by New job (this job only). Nothing changes until the main button is tapped.
 */
export function SheetLayoutDialog({
  open,
  onOpenChange,
  value,
  onSave,
  title = 'Sheet layout',
  description = 'Choose whether the sheet has a grain. Leftovers are always reused, whatever you choose.',
  saveLabel = 'Save',
}: SheetLayoutDialogProps) {
  const [draft, setDraft] = useState<SheetLayout>(value)

  // Each time the popup opens it starts from the layout it was given, not from an earlier unsaved try.
  useEffect(() => {
    if (open) setDraft(value)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92dvh] max-w-[480px] flex-col overflow-hidden p-0">
        <button
          type="button"
          aria-label="Close"
          onClick={() => onOpenChange(false)}
          className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground active:scale-[0.98]"
        >
          <IconX size={20} />
        </button>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-2 pt-5">
        <DialogTitle className="pr-9">{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>

        <p className="mb-2 mt-4 text-[13px] font-semibold text-muted-foreground">Does the sheet have a grain?</p>
        <div role="radiogroup" aria-label="Sheet grain" className="grid grid-cols-2 gap-2">
          {([false, true] as const).map((g) => {
            const selected = draft.grain === g
            return (
              <button
                key={String(g)}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setDraft((d) => ({ ...d, grain: g }))}
                className={cn(choiceClass(selected), 'min-h-[52px]')}
              >
                <GrainPicture grain={g} />
                <span className="min-w-0 flex-1">
                  <span className={cn('block text-[14px] font-semibold leading-tight', selected ? 'text-accent-text' : 'text-foreground')}>{g ? 'Grain' : 'No grain'}</span>
                  <span className="block text-[11.5px] leading-tight text-muted-foreground">{g ? 'Never turned' : 'Can be turned'}</span>
                </span>
              </button>
            )
          })}
        </div>
        <p className="mb-0 mt-2 text-[12.5px] text-muted-foreground">
          {draft.grain ? 'The lines run top to bottom, so every piece stays the way you typed it.' : 'A piece can be turned if that saves a sheet.'}
        </p>

        </div>

        {/* The buttons stay in view while the choices scroll. */}
        <div className="flex gap-2.5 border-t border-hair border-border bg-background px-5 py-3.5">
          <Button size="lg" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="lg"
            className="flex-1"
            onClick={() => {
              onSave(draft)
              onOpenChange(false)
            }}
          >
            {saveLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
