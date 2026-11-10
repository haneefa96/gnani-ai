import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/Button'
import { useEntries } from '../useEntries'

export default function History() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { entries, loading, error, refresh } = useEntries()

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      DRAFT: 'bg-gray-100 text-gray-800',
      WORKER_CONFIRMED: 'bg-blue-100 text-blue-800',
      SHARED: 'bg-purple-100 text-purple-800',
      CONTRACTOR_CONFIRMED: 'bg-green-100 text-green-800',
      CONTRACTOR_DISPUTED: 'bg-red-100 text-red-800',
      UNCONFIRMED: 'bg-orange-100 text-orange-800',
      DELETED: 'bg-gray-400 text-gray-800',
    }
    return (
      <span className={`px-2 py-1 rounded text-xs font-medium ${styles[status] || 'bg-gray-100'}`}>
        {t(`history:statuses.${status}`, { defaultValue: status })}
      </span>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-blue-600 text-white p-4">
        <div className="container mx-auto flex justify-between items-center">
          <h1 className="text-xl font-bold">{t('history:title')}</h1>
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
        {loading ? (
          <div className="text-center py-8">{t('common:loading')}</div>
        ) : error ? (
          <div className="text-center py-8">
            <p role="alert" className="text-red-700 mb-3">{error}</p>
            <Button onClick={() => void refresh()} variant="secondary">
              {t('common:retry')}
            </Button>
          </div>
        ) : (
          <>
            <div className="mb-6">
              <p className="text-gray-600">
                {t('history:entryCount', { count: entries.length })}
              </p>
            </div>

            {entries.length === 0 ? (
              <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
                {t('history:noEntries')}
              </div>
            ) : (
              <div className="space-y-4">
                {entries.map((entry) => (
                <div
                  key={entry.id}
                  className="bg-white rounded-lg shadow p-4"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="flex items-center gap-2">
                        {getStatusBadge(entry.status)}
                        <span className="text-gray-500 text-sm">
                          {entry.work_date}
                        </span>
                      </div>
                      <h3 className="font-semibold mt-2">{entry.site_name || '—'}</h3>
                      <p className="text-gray-600 text-sm">
                        {t('history:contractor', { name: entry.counterparty_name || '—' })}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t">
                    <div>
                      <div className="text-xs text-gray-500">
                        {entry.hours !== null ? t('history:hours') : t('history:days')}
                      </div>
                      <div>
                        {entry.hours !== null
                          ? `${entry.hours}h`
                          : entry.days !== null
                            ? `${entry.days}d`
                            : '—'}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">{t('history:agreed')}</div>
                      <div>₹{entry.agreed_inr}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">{t('history:paid')}</div>
                      <div>₹{entry.paid_inr}</div>
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t flex justify-between items-center">
                    <div>
                      <div className="text-xs text-gray-500">{t('history:due')}</div>
                      <div className={`font-medium ${entry.due_inr > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        ₹{entry.due_inr}
                      </div>
                    </div>
                  </div>
                </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
