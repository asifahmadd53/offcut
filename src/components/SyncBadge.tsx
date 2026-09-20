import { IconWifiOff } from '@tabler/icons-react'
import { useData } from '@/store/data'
import { timeAgo, plural } from '@/lib/format'
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog'

function useSyncState() {
  const { online, pending, pendingCount, fromCache, lastSyncedAt } = useData((s) => s)

  if (!online) {
    return {
      text: 'Offline',
      color: 'grey' as const,
      explain: 'No internet right now. Everything you do is saved on this phone and will send the next time you have signal.',
    }
  }
  if (pending) {
    return {
      text: `${plural(Math.max(pendingCount, 1), 'record')} waiting to sync`,
      color: 'amber' as const,
      explain: 'Some of your work has not reached the server yet. It is safe on this phone and will send automatically once you have a connection.',
    }
  }
  if (fromCache) {
    return {
      text: 'Offline',
      color: 'grey' as const,
      explain: 'Showing what is saved on this phone. It will update once you are back online.',
    }
  }
  const ago = lastSyncedAt ? timeAgo(lastSyncedAt) : 'just now'
  return {
    text: `Synced ${ago}`,
    color: 'green' as const,
    explain: 'Everything on this phone matches the shop record on the server.',
  }
}

const colorClasses: Record<'green' | 'amber' | 'grey', string> = {
  green: 'bg-success-bg text-success-text',
  amber: 'bg-warning-bg text-warning-text',
  grey: 'bg-muted text-muted-foreground',
}

export function SyncBadge() {
  const state = useSyncState()

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className={`inline-flex w-fit shrink-0 items-center gap-1.5 self-start whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ${colorClasses[state.color]}`}
        >
          {state.color === 'grey' && <IconWifiOff size={13} />}
          {state.text}
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>{state.text}</DialogTitle>
        <DialogDescription>{state.explain}</DialogDescription>
      </DialogContent>
    </Dialog>
  )
}
