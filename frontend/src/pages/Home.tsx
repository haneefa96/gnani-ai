import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/Button'
import { VoiceButton } from '../voice/VoiceButton'
import {
  confirmVoiceDraft,
  createVoiceDraft,
  getApiErrorMessage,
  type VoiceDraftConfirmation,
  type VoiceDraftReview,
  type WorkerProfile,
} from '../api'
import { useEntries } from '../useEntries'

interface ReviewForm {
  work_date: string
  site_name: string
  counterparty_name: string
  work_type: string
  hours: string
  days: string
  agreed_amount_inr: string
  paid_amount_inr: string
  language: string
}

function optionalNumber(value: string): number | null {
  if (!value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export default function Home({ worker }: { worker: WorkerProfile }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { entries, loading, error, refresh } = useEntries()
  const [voiceDraft, setVoiceDraft] = useState<VoiceDraftReview | null>(null)
  const [draftAudio, setDraftAudio] = useState<Blob | null>(null)
  const [review, setReview] = useState<ReviewForm | null>(null)
  const [voiceError, setVoiceError] = useState('')
  const [voiceSuccess, setVoiceSuccess] = useState('')
  const [processingAudio, setProcessingAudio] = useState(false)
  const [confirmingEntry, setConfirmingEntry] = useState(false)
  const unconfirmedCount = entries.filter((entry) => entry.status === 'UNCONFIRMED').length
  const latestDue = entries[0]?.due_inr

  const handleAudioEnd = async (audio: Blob) => {
    setVoiceError('')
    setVoiceSuccess('')
    setProcessingAudio(true)
    setDraftAudio(audio)
    try {
      const result = await createVoiceDraft(audio)
      setVoiceDraft(result)
      setReview({
        work_date: result.work_date ?? '',
        site_name: result.site_name ?? '',
        counterparty_name: result.counterparty_name ?? '',
        work_type: result.work_type ?? '',
        hours: result.hours === null ? '' : String(result.hours),
        days: result.days === null ? '' : String(result.days),
        agreed_amount_inr: result.agreed_amount_inr === null
          ? ''
          : String(result.agreed_amount_inr),
        paid_amount_inr: result.paid_amount_inr === null
          ? ''
          : String(result.paid_amount_inr),
        language: result.language || worker.language,
      })
    } catch (requestError) {
      setVoiceError(getApiErrorMessage(requestError, 'Could not process this recording. Please retry.'))
    } finally {
      setProcessingAudio(false)
    }
  }

  const handleConfirmEntry = async () => {
    if (!voiceDraft || !draftAudio || !review) return
    const agreed = optionalNumber(review.agreed_amount_inr)
    const paid = optionalNumber(review.paid_amount_inr)
    if (
      !review.work_date ||
      agreed === null ||
      paid === null ||
      !Number.isInteger(agreed) ||
      !Number.isInteger(paid)
    ) {
      setVoiceError('Enter a work date, agreed wage, and amount paid before confirming.')
      return
    }

    const confirmation: VoiceDraftConfirmation = {
      work_date: review.work_date,
      site_name: review.site_name.trim() || null,
      counterparty_name: review.counterparty_name.trim() || null,
      work_type: review.work_type.trim() || null,
      hours: optionalNumber(review.hours),
      days: optionalNumber(review.days),
      agreed_amount_inr: agreed,
      paid_amount_inr: paid,
      language: review.language,
    }
    setVoiceError('')
    setConfirmingEntry(true)
    try {
      await confirmVoiceDraft(voiceDraft, draftAudio, confirmation)
      setVoiceSuccess('Entry saved and confirmed.')
      setVoiceDraft(null)
      setDraftAudio(null)
      setReview(null)
      await refresh()
    } catch (requestError) {
      setVoiceError(getApiErrorMessage(requestError, 'Could not save the entry. Your review is still available; please retry.'))
    } finally {
      setConfirmingEntry(false)
    }
  }

  const updateReview = <K extends keyof ReviewForm>(key: K, value: ReviewForm[K]) => {
    setReview((current) => current ? { ...current, [key]: value } : current)
  }
  const voiceBusy = processingAudio || confirmingEntry || voiceDraft !== null

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
            isRecording={false}
            label={t('home:recordEntry')}
            onEnd={(audio) => void handleAudioEnd(audio)}
            disabled={voiceBusy}
          />
          {processingAudio && (
            <p role="status" className="mt-4 text-gray-600">
              Processing recording…
            </p>
          )}
          {voiceError && (
            <div className="mt-4" aria-live="polite">
              <p role="alert" className="text-red-700">{voiceError}</p>
              {draftAudio && !voiceDraft && !processingAudio && (
                <Button
                  onClick={() => void handleAudioEnd(draftAudio)}
                  variant="secondary"
                  className="mt-2"
                >
                  Retry processing
                </Button>
              )}
            </div>
          )}
          {voiceSuccess && (
            <p role="status" className="mt-4 text-green-700">{voiceSuccess}</p>
          )}
        </div>

        {voiceDraft && review && (
          <section className="mb-8 rounded-lg border border-blue-200 bg-white p-5 shadow" aria-labelledby="voice-review-title">
            {voiceDraft.voice_mode === 'fake' && (
              <p role="status" className="mb-4 rounded bg-amber-100 p-3 text-left text-amber-900">
                DEMO MODE: this sample transcript and its details are synthetic, not a transcription of your recording.
              </p>
            )}
            <h2 id="voice-review-title" className="mb-3 text-lg font-semibold">
              Review before saving
            </h2>
            <p className="mb-4 rounded bg-gray-50 p-3 text-left text-sm text-gray-700">
              <span className="font-medium">Transcript:</span> {voiceDraft.transcript}
            </p>
            {voiceDraft.needs_clarification.length > 0 && (
              <div className="mb-4 rounded bg-amber-50 p-3 text-left text-sm text-amber-900">
                <p>{voiceDraft.clarification_question || 'Please review the details marked for clarification.'}</p>
                <p className="mt-1">Review these fields: {voiceDraft.needs_clarification.join(', ')}</p>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-left text-sm">
                Work date *
                <input
                  type="date"
                  required
                  value={review.work_date}
                  onChange={(event) => updateReview('work_date', event.target.value)}
                  className="mt-1 w-full rounded border p-2"
                />
              </label>
              <label className="text-left text-sm">
                Counterparty
                <input
                  value={review.counterparty_name}
                  onChange={(event) => updateReview('counterparty_name', event.target.value)}
                  className="mt-1 w-full rounded border p-2"
                />
              </label>
              <label className="text-left text-sm">
                Work site
                <input
                  value={review.site_name}
                  onChange={(event) => updateReview('site_name', event.target.value)}
                  className="mt-1 w-full rounded border p-2"
                />
              </label>
              <label className="text-left text-sm">
                Work type
                <input
                  value={review.work_type}
                  onChange={(event) => updateReview('work_type', event.target.value)}
                  className="mt-1 w-full rounded border p-2"
                />
              </label>
              <label className="text-left text-sm">
                Hours
                <input
                  type="number"
                  min="0"
                  step="0.25"
                  value={review.hours}
                  onChange={(event) => updateReview('hours', event.target.value)}
                  className="mt-1 w-full rounded border p-2"
                />
              </label>
              <label className="text-left text-sm">
                Days
                <input
                  type="number"
                  min="0"
                  step="0.25"
                  value={review.days}
                  onChange={(event) => updateReview('days', event.target.value)}
                  className="mt-1 w-full rounded border p-2"
                />
              </label>
              <label className="text-left text-sm">
                Agreed wage (INR) *
                <input
                  type="number"
                  min="0"
                  step="1"
                  required
                  value={review.agreed_amount_inr}
                  onChange={(event) => updateReview('agreed_amount_inr', event.target.value)}
                  className="mt-1 w-full rounded border p-2"
                />
              </label>
              <label className="text-left text-sm">
                Amount paid (INR) *
                <input
                  type="number"
                  min="0"
                  step="1"
                  required
                  value={review.paid_amount_inr}
                  onChange={(event) => updateReview('paid_amount_inr', event.target.value)}
                  className="mt-1 w-full rounded border p-2"
                />
              </label>
            </div>
            <p className="mt-3 text-left text-xs text-gray-600">
              Due is calculated by the backend when you confirm. No entry is saved before confirmation.
            </p>
            {voiceError && <p role="alert" className="mt-3 text-left text-red-700">{voiceError}</p>}
            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <Button
                onClick={() => void handleConfirmEntry()}
                disabled={confirmingEntry}
                className="flex-1"
              >
                {confirmingEntry ? 'Saving…' : 'Confirm and save entry'}
              </Button>
              <Button
                onClick={() => {
                  setVoiceDraft(null)
                  setDraftAudio(null)
                  setReview(null)
                  setVoiceError('')
                }}
                disabled={confirmingEntry}
                variant="secondary"
                className="flex-1"
              >
                Discard review
              </Button>
            </div>
          </section>
        )}

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
