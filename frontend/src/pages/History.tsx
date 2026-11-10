import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { shareEntry } from '../api'
import { AppHeader } from '../components/AppHeader'
import { AppShell } from '../components/AppShell'
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
    <AppShell>
      <AppHeader
        title={t('history:title')}
        onBack={() => navigate('/home')}
        backLabel={t('common:back')}
        showNav
      />

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        {loading ? (
          <div className="obsidian-card rounded-2xl p-8 text-center text-zinc-400">
            {t('common:loading')}
          </div>
        ) : error ? (
          <div className="obsidian-card rounded-2xl border-rose-500/30 p-8 text-center">
            <p role="alert" className="text-rose-300 text-sm mb-3">{error}</p>
            <Button onClick={() => void refresh()} variant="secondary" size="sm">
              {t('common:retry')}
            </Button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between px-1">
              <p className="text-sm font-medium text-zinc-400">
                {t('history:entryCount', { count: entries.length })}
              </p>
            </div>

            {entries.length === 0 ? (
              <div className="obsidian-card rounded-2xl p-10 text-center text-zinc-400 text-sm">
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
                    className="animate-fade-up obsidian-card rounded-2xl hover:border-white/20 transition-colors p-5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2">
                        <StatusBadge status={entry.status} />
                        <span className="text-zinc-400 text-xs font-mono font-medium tabular-nums">
                          {entry.work_date}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-xs text-zinc-400 mr-1.5">{t('history:due')}:</span>
                        <span
                          className={`font-bold tabular-nums ${
                            entry.due_inr > 0 ? 'text-rose-400' : 'text-emerald-400'
                          }`}
                        >
                          ₹{entry.due_inr}
                        </span>
                      </div>
                    </div>

                    <h3 className="font-semibold text-white">
                      {entry.site_name || '—'}
                    </h3>
                    <p className="text-zinc-400 text-sm mt-0.5">
                      {t('history:contractor', { name: entry.counterparty_name || '—' })}
                    </p>

                    <div className="grid grid-cols-3 gap-3 mt-4 pt-3.5 border-t border-white/[0.07] text-sm">
                      <div>
                        <div className="text-xs text-zinc-500">
                          {entry.hours !== null ? t('history:hours') : t('history:days')}
                        </div>
                        <div className="font-medium text-zinc-100 tabular-nums mt-0.5">
                          {entry.hours !== null
                            ? `${entry.hours}h`
                            : entry.days !== null
                              ? `${entry.days}d`
                              : '—'}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-zinc-500">{t('history:agreed')}</div>
                        <div className="font-medium text-zinc-100 tabular-nums mt-0.5">
                          ₹{entry.agreed_inr}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-zinc-500">{t('history:paid')}</div>
                        <div className="font-medium text-zinc-100 tabular-nums mt-0.5">
                          ₹{entry.paid_inr}
                        </div>
                      </div>
                    </div>

                    {entry.status === 'WORKER_CONFIRMED' && (
                      <div className="mt-4 pt-3 border-t border-white/[0.07] space-y-2">
                        {!shareUrl ? (
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-xs text-zinc-400">
                              Ready for contractor confirmation
                            </span>
                            <button
                              type="button"
                              onClick={() => void handleShare(entry.id)}
                              disabled={isSharing}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-400/10 border border-cyan-400/30 hover:bg-cyan-400/20 text-cyan-300 px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50"
                            >
                              {isSharing ? t('common:loading') : 'Get Contractor Link'}
                            </button>
                          </div>
                        ) : (
                          <div className="rounded-xl bg-zinc-950/90 border border-zinc-800 p-2.5 flex flex-wrap items-center justify-between gap-2">
                            <input
                              type="text"
                              readOnly
                              value={shareUrl}
                              aria-label="Contractor link"
                              onClick={(e) => e.currentTarget.select()}
                              className="min-w-0 flex-1 bg-transparent text-xs text-zinc-300 font-mono focus:outline-none"
                            />
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => void handleCopy(entry.id, shareUrl)}
                                className="rounded-lg bg-zinc-900 border border-zinc-700 hover:bg-zinc-800 px-2.5 py-1 text-xs font-medium text-zinc-200 transition-colors"
                              >
                                {copiedId === entry.id ? 'Copied' : 'Copy'}
                              </button>
                              <a
                                href={shareUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded-lg bg-gradient-to-r from-cyan-400 to-emerald-400 hover:from-cyan-300 hover:to-emerald-300 px-2.5 py-1 text-xs font-semibold text-zinc-950 transition-colors"
                              >
                                Open
                              </a>
                            </div>
                          </div>
                        )}
                        {shareErr && (
                          <p role="alert" className="text-xs text-rose-300">
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
    </AppShell>
  )
}
