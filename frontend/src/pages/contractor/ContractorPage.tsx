import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '../components/Button'
import { VoiceButton } from '../voice/VoiceButton'

export default function ContractorPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { token } = useParams<{ token: string }>()
  
  const [entryData, setEntryData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [recording, setRecording] = useState(false)

  useEffect(() => {
    // In real implementation, fetch entry data from backend
    if (token) {
      setEntryData({
        entry_text: t('contractor:entryText'),
        language: 'hi-IN',
      })
      setLoading(false)
    }
  }, [token])

  const handleVoiceResponse = async (audioBlob: Blob) => {
    // In real implementation, upload audio and get response
    setRecording(false)
    // For demo, assume positive response
    navigate('/contractor/thanks')
  }

  const handleTapResponse = (result: 'yes' | 'no' | 'dispute') => {
    // In real implementation, send response to backend
    navigate('/contractor/thanks')
  }

  if (loading) {
    return <div className="flex items-center justify-center h-screen">{t('common:loading')}</div>
  }

  if (!entryData) {
    return <div className="flex items-center justify-center h-screen">{t('contractor:invalidLink')}</div>
  }

  return (
    <div className="min-h-screen bg-gray-50">
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
          <p className="text-gray-700">{entryData.entry_text}</p>
          <p className="text-sm text-gray-500 mt-2">
            {t('contractor:language', { lang: entryData.language })}
          </p>
        </div>

        {/* Voice confirmation */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h3 className="font-semibold mb-4">{t('contractor:confirmEntry')}</h3>
          <p className="text-sm text-gray-600 mb-4">
            {t('contractor:confirmDescription')}
          </p>
          
          <VoiceButton
            onStateChange={(isRecording) => setRecording(isRecording)}
            isRecording={recording}
            label={t('contractor:recordResponse')}
          />
          
          <div className="mt-6 flex gap-4">
            <Button
              onClick={() => handleTapResponse('yes')}
              className="flex-1"
            >
              {t('contractor:tapYes')}
            </Button>
            <Button
              onClick={() => handleTapResponse('no')}
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
          <Button
            onClick={() => handleTapResponse('dispute')}
            variant="danger"
            className="w-full"
          >
            {t('contractor:tapDispute')}
          </Button>
        </div>
      </div>
    </div>
  )
}
