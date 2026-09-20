import { AppShell } from '@/components/AppShell'
import { SyncBadge } from '@/components/SyncBadge'

/** Full Home screen is built in Stage 7. */
export default function Home() {
  return (
    <AppShell title="Offcut" tab="home" headerRight={<SyncBadge />}>
      <p className="mt-8 text-center text-[15px] text-muted-foreground">Home — coming soon.</p>
    </AppShell>
  )
}
