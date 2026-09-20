import { useState } from 'react'
import { sizesList, type SizesGroupKey } from '@/lib/diagramLayout'
import type { Block } from '@/lib/sheetView'

interface SizesListProps {
  blocks: Block[]
  /** Which sheet this is, for the "This job" heading label when there's more than one. */
  title?: string
}

const GROUP_HEADINGS: Record<SizesGroupKey, string> = {
  piece: 'This job',
  leftover: 'Saved leftovers',
  earlier: 'Earlier cuts',
}

/**
 * Real HTML list of every block's size, grouped by piece / saved leftover / earlier cut,
 * sorted top to bottom then left to right. Every block appears here, whether or not it
 * also carries its own label in the drawing (R15: every block's size is shown somewhere).
 */
export function SizesList({ blocks, title }: SizesListProps) {
  const [earlierOpen, setEarlierOpen] = useState(false)
  const entries = sizesList(blocks)
  const byGroup = {
    piece: entries.filter((e) => e.group === 'piece'),
    leftover: entries.filter((e) => e.group === 'leftover'),
    earlier: entries.filter((e) => e.group === 'earlier'),
  }

  if (entries.length === 0) return null

  return (
    <div className="mb-3.5 rounded-lg bg-muted p-3 text-[14px]">
      {title && <p className="mb-2 text-[13px] font-semibold text-muted-foreground">{title}</p>}
      {(['piece', 'leftover'] as const).map(
        (group) =>
          byGroup[group].length > 0 && (
            <div key={group} className="mb-3 last:mb-0">
              <p className="mb-1 text-[13px] text-muted-foreground">{GROUP_HEADINGS[group]}</p>
              {byGroup[group].map((e, i) => (
                <SizeRow key={i} badges={e.badges} name={e.name} size={e.size} status={e.status} count={e.count} />
              ))}
            </div>
          ),
      )}

      {byGroup.earlier.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setEarlierOpen((v) => !v)}
            className="mb-1 flex w-full min-h-[44px] items-center justify-between text-[13px] text-muted-foreground"
            aria-expanded={earlierOpen}
          >
            <span>
              {GROUP_HEADINGS.earlier} ({byGroup.earlier.reduce((sum, e) => sum + e.count, 0)})
            </span>
            <span aria-hidden="true">{earlierOpen ? '▾' : '▸'}</span>
          </button>
          {earlierOpen &&
            byGroup.earlier.map((e, i) => (
              <SizeRow key={i} badges={e.badges} name={e.name} size={e.size} status={e.status} count={e.count} />
            ))}
        </div>
      )}
    </div>
  )
}

function SizeRow({
  badges,
  name,
  size,
  status,
  count,
}: {
  badges: string[]
  name: string
  size: string
  status?: 'Turned'
  count: number
}) {
  const label = badges.length > 0 ? badges.join(', ') : name
  return (
    <div className="flex items-center justify-between py-1">
      <span className="min-w-0 truncate">
        {label} · {size}
        {status && <span className="text-muted-foreground"> · {status}</span>}
      </span>
      {count > 1 && <span className="ml-2 flex-none text-muted-foreground">({count} pieces)</span>}
    </div>
  )
}
