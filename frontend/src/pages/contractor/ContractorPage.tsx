import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '../../components/Button'
import { VoiceButton } from '../../voice/VoiceButton'
import {
  getContractorApiErrorMessage,
  getContractorEntry,
  submitContractorResponse,
  type ContractorEntry,
  type ContractorResult,
} from '../../api'

export default function ContractorPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { token } = useParams<{ token: string }>()

  const [entryData, setEntryData] = useState<ContractorEntry | null>(null)
  const [loading, setLoading] = useState(true)
  const [recording, setRecording] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [disputeOpen, setDisputeOpen] = useState(false)
  const [reasonText, setReasonText] = useState('')
  const [error, setError] = useState('')

  const loadEntry = useCallback(async () => {
    if (!token) {
      setEntryData(null)
      setError(t('contractor:invalidLink'))
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')
    try {
      setEntryData(await getContractorEntry(token))
    } catch (requestError) {
      setEntryData(null)
      setError(
        getContractorApiErrorMessage(requestError, t('contractor:tokenUnavailable')),
      )
    } finally {
      setLoading(false)
    }
  }, [token, t])

  useEffect(() => {
    void loadEntry()
  }, [loadEntry])

  const submitResponse = async (result: ContractorResult) => {
    if (!token || submitting) return

    setError('')
    setSubmitting(true)
    try {
      const response = await submitContractorResponse(
        token,
        result,
        result === 'dispute' ? reasonText : undefined,
      )
      navigate('/contractor/thanks', {
        replace: true,
        state: { result, status: response.status },
      })
    } catch (requestError) {
      setError(
        getContractorApiErrorMessage(
          requestError,
          t('contractor:responseFailed'),
          t('contractor:tokenUnavailable'),
        ),
      )
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-screen">{t('common:loading')}</div>
  }

  if (!entryData) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
          <p role="alert" className="text-red-700 mb-4">
            {error || t('contractor:tokenUnavailable')}
          </p>
          <p className="text-sm text-gray-600 mb-6">
            {t('contractor:tokenUnavailableHelp')}
          </p>
          <Button onClick={() => void loadEntry()} variant="secondary">
            {t('common:retry')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50" aria-busy={submitting}>
      {/* Header */}
      <div className="bg-blue-600 text-white p-4">
        <div className="container mx-auto flex justify-between items-center">
          <h1 className="text-xl font-bold">Saakshi</h1>
          <div className="text-sm text-blue-100">{t('contractor:contractorPage')}</div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto p-4">
        {/* Notice */}
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6 rounded">
          <h3 className="font-semibold text-yellow-800">{t('contractor:noticeTitle')}</h3>
          <p className="text-sm text-yellow-700 mt-1">
            {t('contractor:noticeDescription')}
          </p>
        </div>

        {/* Entry text */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">{t('contractor:workEntry')}</h2>
          <p className="text-gray-700 whitespace-pre-wrap">
            {entryData.entry_text || '—'}
          </p>
          <p className="text-sm text-gray-500 mt-2">
            {t('contractor:language', { lang: entryData.language })}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {t('contractor:entryId', { id: entryData.entry_id })}
          </p>
        </div>

        {/* Voice confirmation control remains available; recording is not submitted in this sub-chunk. */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h3 className="font-semibold mb-4">{t('contractor:confirmEntry')}</h3>
          <p className="text-sm text-gray-600 mb-4">
            {t('contractor:confirmDescription')}
          </p>

          <VoiceButton
            onStateChange={setRecording}
            isRecording={recording}
            label={t('contractor:recordResponse')}
          />

          {error && (
            <p role="alert" className="bg-red-50 text-red-700 p-3 rounded-lg mt-4 text-sm">
              {error}
            </p>
          )}

          <div className="mt-6 flex gap-4">
            <Button
              onClick={() => void submitResponse('yes')}
              disabled={submitting}
              className="flex-1"
            >
              {t('contractor:tapYes')}
            </Button>
            <Button
              onClick={() => void submitResponse('no')}
              disabled={submitting}
              variant="secondary"
              className="flex-1"
            >
              {t('contractor:tapNo')}
            </Button>
          </div>
        </div>

        {/* Dispute option */}
        <div className="bg-red-50 rounded-lg shadow p-6">
          <h3 className="font-semibold text-red-800 mb-2">
            {t('contractor:disputeEntry')}
          </h3>
          {disputeOpen && (
            <label className="block text-sm font-medium mb-3">
              {t('contractor:disputeReason')}
              <textarea
                value={reasonText}
                onChange={(event) => setReasonText(event.target.value)}
                maxLength={2000}
                rows={3}
                className="w-full p-3 border rounded-lg mt-2"
              />
            </label>
          )}
          <Button
            onClick={() => {
              if (!disputeOpen) {
                setDisputeOpen(true)
                return
              }
              void submitResponse('dispute')
            }}
            disabled={submitting}
            variant="danger"
            className="w-full"
          >
            {disputeOpen ? t('contractor:submitDispute') : t('contractor:tapDispute')}
          </Button>
        </div>
      </div>
    </div>
  )
}
