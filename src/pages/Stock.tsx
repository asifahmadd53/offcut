import { AppShell } from '@/components/AppShell'
import { SyncBadge } from '@/components/SyncBadge'

/** Full Leftover stock screen is built in Stage 7. */
export default function Stock() {
  return (
    <AppShell title="Leftover stock" tab="stock" headerRight={<SyncBadge />}>
      <p className="mt-8 text-center text-[15px] text-muted-foreground">Stock — coming soon.</p>
    </AppShell>
  )
}
