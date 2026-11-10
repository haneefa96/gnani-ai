import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { AppHeader } from '../components/AppHeader'
import { Button } from '../components/Button'
import {
  changeWorkerPin,
  getApiErrorMessage,
  SUPPORTED_LANGUAGE_OPTIONS,
  updateWorkerLanguage,
  type WorkerProfile,
} from '../api'

export default function Settings({
  worker,
  onLogout,
  onLanguageChange,
}: {
  worker: WorkerProfile
  onLogout: () => void
  onLanguageChange?: (language: string) => void
}) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [pin, setPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [pinError, setPinError] = useState('')
  const [pinSuccess, setPinSuccess] = useState('')
  const [changingPin, setChangingPin] = useState(false)
  const [changingLanguage, setChangingLanguage] = useState(false)
  const [languageError, setLanguageError] = useState('')

  const handlePinChange = async () => {
    setPinError('')
    setPinSuccess('')
    if (!/^[0-9]{4}$/.test(newPin)) {
      setPinError(t('settings:pinMustBe4Digits'))
      return
    }
    if (newPin !== confirmPin) {
      setPinError(t('settings:pinsDoNotMatch'))
      return
    }

    setChangingPin(true)
    try {
      await changeWorkerPin(pin, newPin)
      setPin('')
      setNewPin('')
      setConfirmPin('')
      setPinSuccess(t('settings:pinChanged'))
    } catch (requestError) {
      setPinError(getApiErrorMessage(requestError, t('settings:pinChangeFailed')))
    } finally {
      setChangingPin(false)
    }
  }

  const handleDeleteAccount = () => {
    if (confirm(t('settings:deleteAccountConfirm'))) {
      onLogout()
    }
  }

  const handleLanguageSelect = async (code: string) => {
    if (changingLanguage || code === worker.language) return
    setLanguageError('')
    setChangingLanguage(true)
    try {
      const res = await updateWorkerLanguage(code)
      const nextLanguage = res.language || code
      await i18n.changeLanguage(nextLanguage)
      onLanguageChange?.(nextLanguage)
    } catch (requestError) {
      setLanguageError(getApiErrorMessage(requestError, t('common:retry')))
    } finally {
      setChangingLanguage(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader
        title={t('settings:title')}
        onBack={() => navigate('/home')}
        backLabel={t('common:back')}
        showNav
      />

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        {/* Worker info */}
        <section className="animate-fade-up bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h2 className="font-semibold text-slate-900">
              {t('settings:workerInfo')}
            </h2>
            <Button onClick={onLogout} variant="secondary" size="sm">
              {t('common:logout')}
            </Button>
          </div>
          <div className="divide-y divide-slate-100 text-sm">
            <div className="flex justify-between py-2.5">
              <span className="text-slate-500">{t('settings:alias')}</span>
              <span className="font-medium text-slate-900">{worker.alias}</span>
            </div>
            <div className="flex justify-between py-2.5">
              <span className="text-slate-500">{t('settings:language')}</span>
              <span className="font-medium text-slate-900">
                {worker.language}
              </span>
            </div>
          </div>
        </section>

        {/* Language preference */}
        <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5">
          <h2 className="font-semibold text-slate-900 mb-1.5">
            {t('settings:language')}
          </h2>
          <p className="text-sm text-slate-600 mb-2">
            {t('settings:languageDescription')}
          </p>
          <p className="text-xs font-medium text-slate-500 mb-3">
            {t('settings:currentLanguage', { lang: worker.language })}
          </p>
          {languageError && (
            <p
              role="alert"
              className="text-sm text-rose-700 bg-rose-50 border border-rose-200 p-2.5 rounded-xl mb-3"
            >
              {languageError}
            </p>
          )}
          <div className="grid grid-cols-2 gap-2.5">
            {SUPPORTED_LANGUAGE_OPTIONS.map((lang) => (
              <button
                key={lang.code}
                type="button"
                disabled={changingLanguage}
                onClick={() => void handleLanguageSelect(lang.code)}
                className={`p-3 rounded-xl border transition text-sm font-medium ${
                  worker.language === lang.code
                    ? 'bg-indigo-700 text-white border-indigo-700 shadow-sm'
                    : 'bg-slate-50 text-slate-800 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                }`}
              >
                {lang.name}
              </button>
            ))}
          </div>
        </section>

        {/* Change PIN */}
        <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5">
          <h2 className="font-semibold text-slate-900 mb-4">
            {t('settings:changePin')}
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                {t('settings:currentPin')}
              </label>
              <input
                id="current-pin"
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder={t('settings:enterCurrentPin')}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl bg-white text-slate-900 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20 focus:outline-none"
                inputMode="numeric"
                maxLength={72}
                autoComplete="current-password"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                {t('settings:newPin')}
              </label>
              <input
                id="new-pin"
                type="password"
                value={newPin}
                onChange={(e) => setNewPin(e.target.value)}
                placeholder={t('settings:enterNewPin')}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl bg-white text-slate-900 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20 focus:outline-none"
                inputMode="numeric"
                maxLength={4}
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                {t('settings:confirmNewPin')}
              </label>
              <input
                id="confirm-new-pin"
                type="password"
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value)}
                placeholder={t('settings:confirmNewPin')}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl bg-white text-slate-900 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20 focus:outline-none"
                inputMode="numeric"
                maxLength={4}
                autoComplete="new-password"
              />
            </div>
            {pinError && (
              <p role="alert" className="text-sm text-rose-700">
                {pinError}
              </p>
            )}
            {pinSuccess && (
              <p role="status" className="text-sm text-emerald-700">
                {pinSuccess}
              </p>
            )}
            <Button
              onClick={() => void handlePinChange()}
              disabled={changingPin}
              className="w-full"
            >
              {changingPin ? t('common:loading') : t('settings:savePin')}
            </Button>
          </div>
        </section>

        {/* Data deletion */}
        <section className="bg-rose-50/70 rounded-2xl border border-rose-200 p-5">
          <h2 className="font-semibold text-rose-900 mb-2">
            {t('settings:deleteAccount')}
          </h2>
          <p className="text-sm text-rose-700 mb-4">
            {t('settings:deleteAccountWarning')}
          </p>
          <Button
            onClick={handleDeleteAccount}
            variant="danger"
            className="w-full"
          >
            {t('settings:deleteAccount')}
          </Button>
        </section>
      </main>
    </div>
  )
}
