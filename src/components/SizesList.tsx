import type { SizesListEntry } from '@/lib/diagramLabels'

interface SizesListProps {
  entries: SizesListEntry[]
}

/**
 * Real HTML text listing every block that fell back to a badge on the drawing, grouped
 * when identical: "1, 2 · 1.6 × 18 (2 pieces)". Every badge block appears here, so a
 * block is always either labelled inside the drawing or shown here — never neither
 * (R15). Body text 14px, easy to read next to the smaller in-drawing labels.
 */
export function SizesList({ entries }: SizesListProps) {
  if (entries.length === 0) return null

  return (
    <div className="mb-3.5 rounded-lg bg-muted p-3 text-[14px]">
      <p className="mb-1.5 text-[13px] text-muted-foreground">Sizes</p>
      {entries.map((e, i) => (
        <p key={i} className="mb-0.5 last:mb-0">
          {e.badgeLabels.join(', ')} · {e.size}
          {e.count > 1 && <span className="text-muted-foreground"> ({e.count} pieces)</span>}
        </p>
      ))}
    </div>
  )
}
