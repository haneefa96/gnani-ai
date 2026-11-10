import { useTranslation } from 'react-i18next'

const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-zinc-800/80 text-zinc-300 border-zinc-700',
  WORKER_CONFIRMED: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30',
  SHARED: 'bg-sky-500/10 text-sky-300 border-sky-500/30',
  CONTRACTOR_CONFIRMED: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  CONTRACTOR_DISPUTED: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
  UNCONFIRMED: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  DELETED: 'bg-zinc-900 text-zinc-500 border-zinc-800',
}

export function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation()
  const style = STATUS_STYLES[status] || 'bg-zinc-800/80 text-zinc-300 border-zinc-700'
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${style}`}
    >
      {t(`history:statuses.${status}`, { defaultValue: status })}
    </span>
  )
}
