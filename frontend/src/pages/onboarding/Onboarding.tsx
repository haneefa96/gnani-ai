import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../components/Button'
import {
  getApiErrorMessage,
  registerWorker,
  SUPPORTED_LANGUAGE_OPTIONS,
  type AuthResponse,
  type WorkerProfile,
} from '../../api'

export default function Onboarding({
  onLogin,
}: {
  onLogin: (response: AuthResponse, profile: WorkerProfile) => void
}) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [alias, setAlias] = useState('')
  const [selectedLanguage, setSelectedLanguage] = useState(() => {
    const active = i18n.resolvedLanguage || i18n.language
    return SUPPORTED_LANGUAGE_OPTIONS.some((lang) => lang.code === active)
      ? active
      : 'hi-IN'
  })
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [step, setStep] = useState(1)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLanguageChange = (code: string) => {
    setSelectedLanguage(code)
    void i18n.changeLanguage(code)
  }

  const handlePinSetup = async () => {
    const normalizedAlias = alias.trim()
    if (normalizedAlias.length < 3) {
      setError(t('onboarding:aliasTooShort'))
      setStep(1)
      return
    }
    if (!/^\d{4}$/.test(pin)) {
      setError(t('onboarding:pinMustBe4Digits'))
      return
    }
    if (pin !== confirmPin) {
      setError(t('onboarding:pinsDoNotMatch'))
      return
    }

    setError('')
    setLoading(true)
    try {
      const response = await registerWorker(normalizedAlias, pin, selectedLanguage)
      onLogin(response, { alias: normalizedAlias, language: selectedLanguage })
      navigate('/home', { replace: true })
    } catch (registrationError) {
      setError(getApiErrorMessage(registrationError, t('onboarding:authFailed')))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 via-slate-50 to-white flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 sm:p-8">
        <div className="flex flex-col items-center mb-6">
          <div
            aria-hidden="true"
            className="w-12 h-12 rounded-2xl bg-indigo-950 text-emerald-300 flex items-center justify-center shadow-sm mb-3"
          >
            <svg
              viewBox="0 0 24 24"
              className="w-6 h-6 fill-none stroke-current"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <path d="m9 12 2 2 4-4" />
            </svg>
          </div>
          <span className="text-xs font-semibold uppercase tracking-wider text-indigo-700 mb-1">
            {step} / 2
          </span>
          <h1 className="text-2xl font-bold text-slate-900 text-center tracking-tight">
            {step === 1 ? t('onboarding:welcome') : t('onboarding:setPin')}
          </h1>
        </div>

        {error && (
          <div
            role="alert"
            className="bg-rose-50 border border-rose-200 text-rose-700 p-3 rounded-xl mb-4 text-sm"
          >
            {error}
          </div>
        )}

        {step === 1 && (
          <>
            <div className="mb-5">
              <label
                htmlFor="worker-alias"
                className="block text-sm font-medium text-slate-700 mb-1.5"
              >
                {t('onboarding:alias')}
              </label>
              <input
                id="worker-alias"
                type="text"
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
                placeholder={t('onboarding:enterAlias')}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl bg-white text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20 focus:outline-none transition"
                maxLength={50}
                autoComplete="username"
              />
            </div>
            <p className="text-sm font-medium text-slate-700 mb-2.5">
              {t('onboarding:chooseLanguage')}
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              {SUPPORTED_LANGUAGE_OPTIONS.map((lang) => (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => handleLanguageChange(lang.code)}
                  className={`p-3 rounded-xl border text-sm font-medium transition ${
                    selectedLanguage === lang.code
                      ? 'bg-indigo-700 text-white border-indigo-700 shadow-sm'
                      : 'bg-slate-50 text-slate-800 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                  }`}
                >
                  {lang.name}
                </button>
              ))}
            </div>
            <Button
              onClick={() => {
                if (alias.trim().length < 3) {
                  setError(t('onboarding:aliasTooShort'))
                  return
                }
                setError('')
                setStep(2)
              }}
              className="mt-6 w-full"
            >
              {t('common:next')}
            </Button>
          </>
        )}

        {step === 2 && (
          <>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  {t('onboarding:createPin')}
                </label>
                <input
                  type="password"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="••••"
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl bg-white text-slate-900 text-center tracking-[0.4em] focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20 focus:outline-none transition"
                  inputMode="numeric"
                  maxLength={4}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  {t('onboarding:confirmPin')}
                </label>
                <input
                  type="password"
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value)}
                  placeholder="••••"
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl bg-white text-slate-900 text-center tracking-[0.4em] focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20 focus:outline-none transition"
                  inputMode="numeric"
                  maxLength={4}
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <Button
                onClick={() => setStep(1)}
                variant="secondary"
                className="flex-1"
              >
                {t('common:back')}
              </Button>
              <Button
                onClick={handlePinSetup}
                disabled={loading}
                className="flex-1"
              >
                {loading ? t('common:loading') : t('common:save')}
              </Button>
            </div>
          </>
        )}

        {step === 1 && (
          <p className="mt-5 pt-4 border-t border-slate-100 text-center text-sm text-slate-600">
            {t('onboarding:haveAccount')}{' '}
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="font-semibold text-indigo-700 hover:text-indigo-900"
            >
              {t('onboarding:login')}
            </button>
          </p>
        )}
      </div>
    </div>
  )
}
