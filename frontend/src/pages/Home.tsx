import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/Button'
import { VoiceButton } from '../voice/VoiceButton'
import type { WorkerProfile } from '../api'
import { useEntries } from '../useEntries'

export default function Home({ worker }: { worker: WorkerProfile }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [isRecording, setIsRecording] = useState(false)
  const { entries, loading, error, refresh } = useEntries()
  const unconfirmedCount = entries.filter((entry) => entry.status === 'UNCONFIRMED').length
  const latestDue = entries[0]?.due_inr

  const handleRecord = (isRecording: boolean) => {
    setIsRecording(isRecording)
    if (!isRecording) {
      // Start recording
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-blue-600 text-white p-4">
        <div className="container mx-auto flex justify-between items-center">
          <h1 className="text-xl font-bold">Saakshi</h1>
          <button
            onClick={() => navigate('/settings')}
            className="p-2"
            aria-label={t('common:settings')}
          >
            ⚙️
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="container mx-auto p-4">
        <div className="text-center mb-8">
          <h2 className="text-lg mb-4">{t('home:description')}</h2>
          <p className="text-gray-600 text-sm mb-6">
            {t('home:worker', { worker: worker.alias })}
          </p>
          
          <VoiceButton
            onStateChange={handleRecord}
            isRecording={isRecording}
            label={t('home:recordEntry')}
          />
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-white p-4 rounded-lg shadow text-center">
            <div className="text-2xl font-bold text-blue-600">
              {loading || error ? '—' : t('home:entries', { count: entries.length })}
            </div>
            <div className="text-sm text-gray-600">{t('home:totalEntries')}</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow text-center">
            <div className="text-2xl font-bold text-green-600">
              {loading || error || latestDue === undefined
                ? '—'
                : t('home:dueAmount', { amount: latestDue })}
            </div>
            <div className="text-sm text-gray-600">{t('home:latestEntryDue')}</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow text-center">
            <div className="text-2xl font-bold text-orange-600">
              {loading || error ? '—' : t('home:unconfirmed', { count: unconfirmedCount })}
            </div>
            <div className="text-sm text-gray-600">{t('home:unconfirmedEntries')}</div>
          </div>
        </div>

        {/* Recent entries */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">{t('home:recentEntries')}</h3>
            <button
              onClick={() => navigate('/history')}
              className="text-blue-600 hover:text-blue-800"
            >
              {t('home:viewAll')}
            </button>
          </div>
          <div className="bg-white rounded-lg shadow p-4" aria-live="polite">
            {loading ? (
              <div className="text-center text-gray-500 py-8">{t('common:loading')}</div>
            ) : error ? (
              <div className="text-center py-6">
                <p role="alert" className="text-red-700 mb-3">{error}</p>
                <Button onClick={() => void refresh()} variant="secondary">
                  {t('common:retry')}
                </Button>
              </div>
            ) : entries.length === 0 ? (
              <div className="text-center text-gray-500 py-8">{t('home:noEntriesYet')}</div>
            ) : (
              <div className="space-y-3">
                {entries.slice(0, 3).map((entry) => (
                  <div key={entry.id} className="border-b last:border-b-0 pb-3 last:pb-0">
                    <div className="flex justify-between gap-3">
                      <div>
                        <div className="font-medium">{entry.site_name || '—'}</div>
                        <div className="text-sm text-gray-600">
                          {entry.work_date} · {entry.counterparty_name || '—'}
                        </div>
                      </div>
                      <div className="text-right">
                        <div>{t('home:dueAmount', { amount: entry.due_inr })}</div>
                        <div className="text-xs text-gray-500">{entry.status}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Evidence pack */}
        <div className="mb-8">
          <h3 className="text-lg font-semibold mb-4">{t('home:evidencePack')}</h3>
          <div className="bg-white rounded-lg shadow p-4">
            <Button
              onClick={() => navigate('/export')}
              className="w-full"
            >
              {t('home:generatePack')}
            </Button>
            <p className="text-sm text-gray-600 mt-2">
              {t('home:packDescription')}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
