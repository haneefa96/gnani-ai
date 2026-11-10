import { useTranslation } from 'react-i18next'

const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-700 border-slate-200',
  WORKER_CONFIRMED: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  SHARED: 'bg-purple-50 text-purple-700 border-purple-200',
  CONTRACTOR_CONFIRMED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  CONTRACTOR_DISPUTED: 'bg-rose-50 text-rose-700 border-rose-200',
  UNCONFIRMED: 'bg-amber-50 text-amber-800 border-amber-200',
  DELETED: 'bg-slate-200 text-slate-600 border-slate-300',
}

export function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation()
  const style = STATUS_STYLES[status] || 'bg-slate-100 text-slate-700 border-slate-200'
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${style}`}
    >
      {t(`history:statuses.${status}`, { defaultValue: status })}
    </span>
  )
}

