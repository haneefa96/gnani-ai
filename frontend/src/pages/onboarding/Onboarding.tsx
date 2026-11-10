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
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
        <h1 className="text-2xl font-bold mb-6 text-center">
          {step === 1 ? t('onboarding:welcome') : t('onboarding:setPin')}
        </h1>

        {error && (
          <div role="alert" className="bg-red-50 text-red-700 p-3 rounded-lg mb-4 text-sm">
            {error}
          </div>
        )}

        {step === 1 && (
          <>
            <div className="mb-6">
              <label htmlFor="worker-alias" className="block text-sm font-medium mb-2">
                {t('onboarding:alias')}
              </label>
              <input
                id="worker-alias"
                type="text"
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
                placeholder={t('onboarding:enterAlias')}
                className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
                maxLength={50}
                autoComplete="username"
              />
            </div>
            <p className="mb-6">{t('onboarding:chooseLanguage')}</p>
            <div className="space-y-2">
              {SUPPORTED_LANGUAGE_OPTIONS.map((lang) => (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => handleLanguageChange(lang.code)}
                  className={`w-full p-3 rounded-lg transition ${
                    selectedLanguage === lang.code
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 hover:bg-gray-200'
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
                <label className="block text-sm font-medium mb-2">
                  {t('onboarding:createPin')}
                </label>
                <input
                  type="password"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="••••"
                  className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  inputMode="numeric"
                  maxLength={4}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">
                  {t('onboarding:confirmPin')}
                </label>
                <input
                  type="password"
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value)}
                  placeholder="••••"
                  className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  inputMode="numeric"
                  maxLength={4}
                />
              </div>
            </div>
            <div className="flex gap-4 mt-6">
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
          <p className="mt-4 text-center text-sm text-gray-600">
            {t('onboarding:haveAccount')}{' '}
            <button
              onClick={() => navigate('/login')}
              className="text-blue-600 hover:text-blue-800"
            >
              {t('onboarding:login')}
            </button>
          </p>
        )}
      </div>
    </div>
  )
}
