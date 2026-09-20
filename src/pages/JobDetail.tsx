import { useNavigate, useParams } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { PlanSheet } from '@/components/PlanSheet'
import { Button } from '@/components/ui/button'
import { dayMonth } from '@/lib/format'
import { pieceSummary, sourceSummary } from '@/lib/summary'
import { buildBlocks } from '@/lib/sheetView'
import { useData } from '@/store/data'
import { useJob } from '@/store/job'

export default function JobDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const derived = useData((s) => s.derived)
  const setPieces = useJob((s) => s.setPieces)

  const job = derived.jobs.find((j) => j.cut.id === id)

  if (!job) {
    return (
      <AppShell title="Job" back="/">
        <p className="mt-8 text-center text-[15px] text-muted-foreground">
          This job could not be found.
        </p>
      </AppShell>
    )
  }

  const { cut, status, conflict } = job
  const bladeText = cut.kerf && cut.kerf > 0 ? `blade ${cut.kerf} in` : 'blade off'

  function cutAgain() {
    if (cut.pieces) setPieces(cut.pieces)
    navigate('/new')
  }

  return (
    <AppShell title={pieceSummary(cut.pieces)} back="/">
      <p className="mb-3.5 text-[13px] text-muted-foreground">
        Cut on {dayMonth(cut.createdAt)} · {sourceSummary(cut.sheets)} · {bladeText}
      </p>

      {status === 'conflict' && conflict && (
        <div className="mb-3.5 rounded-lg bg-warning-bg p-3 text-[13.5px] text-warning-text">
          <p className="mb-2">This job needs your answer before its leftovers count.</p>
          <Button variant="outline" className="h-10 w-full" onClick={() => navigate('/sync-check')}>
            Answer now
          </Button>
        </div>
      )}

      {cut.sheets.map((sheet, i) => (
        <PlanSheet key={sheet.sheetId + i} sheet={sheet} blocks={buildBlocks(sheet, derived, cut.id)} />
      ))}

      <Button variant="outline" className="mb-2.5 h-12 w-full" onClick={() => navigate(`/print/${cut.id}`)}>
        Print
      </Button>
      <Button variant="outline" className="h-12 w-full" onClick={cutAgain}>
        Cut these pieces again
      </Button>
    </AppShell>
  )
}
