import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '../../components/Button'

interface ContractorResultState {
  result?: unknown
  status?: unknown
}

export default function ContractorThanks() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const response = location.state as ContractorResultState | null
  const result =
    response?.result === 'yes' || response?.result === 'no' || response?.result === 'dispute'
      ? response.result
      : null
  const status = typeof response?.status === 'string' ? response.status : null
  const submission = result && status ? { result, status } : null

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 via-slate-50 to-white flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 sm:p-8 text-center">
        {submission && (
          <div
            aria-hidden="true"
            className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center"
          >
            <svg
              viewBox="0 0 24 24"
              className="w-7 h-7 fill-none stroke-current"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>
        )}
        <h2 className="text-2xl font-bold text-slate-900 mb-3 tracking-tight">
          {submission ? t('contractor:thanksTitle') : t('contractor:notSubmittedTitle')}
        </h2>
        <p className="text-sm text-slate-600 mb-6">
          {submission
            ? t('contractor:recordedStatus', {
                result: t(`contractor:results.${submission.result}`),
                status: submission.status,
              })
            : t('contractor:notSubmittedDescription')}
        </p>
        <Button
          onClick={() => navigate(-1)}
          className="w-full"
        >
          {submission ? t('common:back') : t('contractor:returnToEntry')}
        </Button>
      </div>
    </div>
  )
}
