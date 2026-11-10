import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { shareEntry } from '../api'
import { AppHeader } from '../components/AppHeader'
import { Button } from '../components/Button'
import { StatusBadge } from '../components/StatusBadge'
import { useEntries } from '../useEntries'

export default function History() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { entries, loading, error, refresh } = useEntries()
  const [sharingId, setSharingId] = useState<number | null>(null)
  const [shareUrls, setShareUrls] = useState<Record<number, string>>({})
  const [shareErrors, setShareErrors] = useState<Record<number, string>>({})
  const [copiedId, setCopiedId] = useState<number | null>(null)

  const handleShare = async (entryId: number) => {
    setSharingId(entryId)
    setShareErrors((prev) => {
      const next = { ...prev }
      delete next[entryId]
      return next
    })
    try {
      const { share_url } = await shareEntry(entryId)
      setShareUrls((prev) => ({ ...prev, [entryId]: share_url }))
    } catch {
      setShareErrors((prev) => ({
        ...prev,
        [entryId]: t('common:error', 'Could not create link'),
      }))
    } finally {
      setSharingId(null)
    }
  }

  const handleCopy = async (entryId: number, url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      setCopiedId(entryId)
      window.setTimeout(() => setCopiedId((id) => (id === entryId ? null : id)), 2000)
    } catch {
      // Fallback: URL remains visible & selectable for manual copy
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader
        title={t('history:title')}
        onBack={() => navigate('/home')}
        backLabel={t('common:back')}
        showNav
      />

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        {loading ? (
          <div className="bg-white rounded-2xl border border-slate-200/80 p-8 text-center text-slate-500">
            {t('common:loading')}
          </div>
        ) : error ? (
          <div className="bg-white rounded-2xl border border-rose-200 p-8 text-center">
            <p role="alert" className="text-rose-700 text-sm mb-3">{error}</p>
            <Button onClick={() => void refresh()} variant="secondary" size="sm">
              {t('common:retry')}
            </Button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between px-1">
              <p className="text-sm font-medium text-slate-600">
                {t('history:entryCount', { count: entries.length })}
              </p>
            </div>

            {entries.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-10 text-center text-slate-500 text-sm">
                {t('history:noEntries')}
              </div>
            ) : (
              <div className="space-y-3.5">
                {entries.map((entry) => {
                  const shareUrl = shareUrls[entry.id]
                  const shareErr = shareErrors[entry.id]
                  const isSharing = sharingId === entry.id
                  return (
                  <article
                    key={entry.id}
                    className="animate-fade-up bg-white rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition-shadow p-5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2">
                        <StatusBadge status={entry.status} />
                        <span className="text-slate-500 text-xs font-medium tabular-nums">
                          {entry.work_date}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-xs text-slate-500 mr-1.5">{t('history:due')}:</span>
                        <span
                          className={`font-bold tabular-nums ${
                            entry.due_inr > 0 ? 'text-rose-600' : 'text-emerald-600'
                          }`}
                        >
                          ₹{entry.due_inr}
                        </span>
                      </div>
                    </div>

                    <h3 className="font-semibold text-slate-900">
                      {entry.site_name || '—'}
                    </h3>
                    <p className="text-slate-600 text-sm mt-0.5">
                      {t('history:contractor', { name: entry.counterparty_name || '—' })}
                    </p>

                    <div className="grid grid-cols-3 gap-3 mt-4 pt-3.5 border-t border-slate-100 text-sm">
                      <div>
                        <div className="text-xs text-slate-500">
                          {entry.hours !== null ? t('history:hours') : t('history:days')}
                        </div>
                        <div className="font-medium text-slate-900 tabular-nums mt-0.5">
                          {entry.hours !== null
                            ? `${entry.hours}h`
                            : entry.days !== null
                              ? `${entry.days}d`
                              : '—'}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500">{t('history:agreed')}</div>
                        <div className="font-medium text-slate-900 tabular-nums mt-0.5">
                          ₹{entry.agreed_inr}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500">{t('history:paid')}</div>
                        <div className="font-medium text-slate-900 tabular-nums mt-0.5">
                          ₹{entry.paid_inr}
                        </div>
                      </div>
                    </div>

                    {entry.status === 'WORKER_CONFIRMED' && (
                      <div className="mt-4 pt-3 border-t border-slate-100 space-y-2">
                        {!shareUrl ? (
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-xs text-slate-500">
                              Ready for contractor confirmation
                            </span>
                            <button
                              type="button"
                              onClick={() => void handleShare(entry.id)}
                              disabled={isSharing}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50"
                            >
                              {isSharing ? t('common:loading') : 'Get Contractor Link'}
                            </button>
                          </div>
                        ) : (
                          <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-2.5 flex flex-wrap items-center justify-between gap-2">
                            <input
                              type="text"
                              readOnly
                              value={shareUrl}
                              aria-label="Contractor link"
                              onClick={(e) => e.currentTarget.select()}
                              className="min-w-0 flex-1 bg-transparent text-xs text-slate-700 font-mono focus:outline-none"
                            />
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => void handleCopy(entry.id, shareUrl)}
                                className="rounded-lg bg-white border border-slate-200 hover:bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors"
                              >
                                {copiedId === entry.id ? 'Copied' : 'Copy'}
                              </button>
                              <a
                                href={shareUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded-lg bg-indigo-700 hover:bg-indigo-800 px-2.5 py-1 text-xs font-medium text-white transition-colors"
                              >
                                Open
                              </a>
                            </div>
                          </div>
                        )}
                        {shareErr && (
                          <p role="alert" className="text-xs text-rose-700">
                            {shareErr}
                          </p>
                        )}
                      </div>
                    )}
                  </article>
                  )
                })}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
