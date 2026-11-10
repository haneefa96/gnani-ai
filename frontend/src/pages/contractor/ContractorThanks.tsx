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
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
        {submission && <div className="text-6xl mb-4">✓</div>}
        <h2 className="text-2xl font-bold mb-4">
          {submission ? t('contractor:thanksTitle') : t('contractor:notSubmittedTitle')}
        </h2>
        <p className="text-gray-600 mb-6">
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
