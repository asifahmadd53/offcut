import type { Status } from './types'

const TAG: Record<Status, { label: string; cls: string }> = {
    paid: { label: 'Paid', cls: 'bg-green-500/15 text-green-700 dark:text-green-400' },
    unpaid: { label: 'Unpaid', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
}

export function StatusTag({ status }: { status: Status }) {
    const t = TAG[status]
    return (
        <span className={`inline-block rounded-md px-2 py-0.5 text-[11.5px] font-medium ${t.cls}`}>{t.label}</span>
    )
}