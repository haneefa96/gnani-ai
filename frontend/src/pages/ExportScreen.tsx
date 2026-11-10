import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/Button'

export default function ExportScreen() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [generated, setGenerated] = useState(false)
  const [periodFrom, setPeriodFrom] = useState('')
  const [periodTo, setPeriodTo] = useState('')

  const handleGenerate = async () => {
    if (!periodFrom || !periodTo) {
      alert(t('export:enterPeriod'))
      return
    }
    setLoading(true)
    // In real implementation, call evidence pack API
    setTimeout(() => {
      setLoading(false)
      setGenerated(true)
    }, 1000)
  }

  if (generated) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
          <div className="text-6xl mb-4">✓</div>
          <h2 className="text-2xl font-bold mb-4">{t('export:generated')}</h2>
          <p className="text-gray-600 mb-6">
            {t('export:packGenerated')}
          </p>
          <div className="space-y-2">
            <Button className="w-full">{t('export:downloadPDF')}</Button>
            <Button variant="secondary" className="w-full">
              {t('export:downloadZIP')}
            </Button>
          </div>
          <Button
            onClick={() => {
              setGenerated(false)
              setPeriodFrom('')
              setPeriodTo('')
            }}
            variant="secondary"
            className="w-full mt-4"
          >
            {t('common:back')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-blue-600 text-white p-4">
        <div className="container mx-auto flex justify-between items-center">
          <h1 className="text-xl font-bold">{t('export:title')}</h1>
          <button
            onClick={() => navigate('/home')}
            className="p-2"
            aria-label={t('common:back')}
          >
            ←
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto p-4">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">
            {t('export:generatePack')}
          </h2>
          <p className="text-gray-600 mb-6">
            {t('export:periodDescription')}
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                {t('export:periodFrom')}
              </label>
              <input
                type="date"
                value={periodFrom}
                onChange={(e) => setPeriodFrom(e.target.value)}
                className="w-full p-3 border rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">
                {t('export:periodTo')}
              </label>
              <input
                type="date"
                value={periodTo}
                onChange={(e) => setPeriodTo(e.target.value)}
                className="w-full p-3 border rounded-lg"
              />
            </div>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={loading}
            className="w-full mt-6"
          >
            {loading ? t('common:loading') : t('export:generate')}
          </Button>

          <div className="mt-6">
            <h3 className="font-semibold mb-2">{t('export:whatIsIncluded')}</h3>
            <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
              <li>{t('export:includedPDF')}</li>
              <li>{t('export:includedAudio')}</li>
              <li>{t('export:includedManifest')}</li>
              <li>{t('export:includedVerification')}</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
