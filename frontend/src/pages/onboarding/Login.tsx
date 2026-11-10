import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { AuthBackdrop } from '../../components/AuthBackdrop'
import { Button } from '../../components/Button'
import {
  getApiErrorMessage,
  loginWorker,
  type AuthResponse,
  type WorkerProfile,
} from '../../api'

export default function Login({
  onLogin,
}: {
  onLogin: (response: AuthResponse, profile: WorkerProfile) => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [alias, setAlias] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async () => {
    const normalizedAlias = alias.trim()
    if (normalizedAlias.length < 3) {
      setError(t('onboarding:aliasTooShort'))
      return
    }
    if (!pin) {
      setError(t('onboarding:emptyFields'))
      return
    }

    if (!/^\d{4}$/.test(pin)) {
      setError(t('onboarding:pinMustBe4Digits'))
      return
    }

    setError('')
    setLoading(true)
    try {
      const response = await loginWorker(normalizedAlias, pin)
      onLogin(response, {
        alias: normalizedAlias,
        language: response.language || 'hi-IN',
      })
      navigate('/home', { replace: true })
    } catch (loginError) {
      setError(getApiErrorMessage(loginError, t('onboarding:authFailed')))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthBackdrop>
      <div className="w-full bg-white/95 backdrop-blur-xl rounded-3xl border border-white/25 shadow-2xl p-6 sm:p-8">
        <div className="flex flex-col items-center mb-6">
          <div
            aria-hidden="true"
            className="w-12 h-12 rounded-2xl bg-indigo-950 text-emerald-300 flex items-center justify-center shadow-md mb-3"
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
          <h1 className="text-2xl font-bold text-slate-900 text-center tracking-tight">
            {t('onboarding:welcomeBack')}
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

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              {t('onboarding:alias')}
            </label>
            <input
              type="text"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              placeholder={t('onboarding:enterAlias')}
              className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl bg-white text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20 focus:outline-none transition"
              maxLength={50}
              autoComplete="username"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              {t('onboarding:pin')}
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
        </div>

        <Button onClick={handleLogin} disabled={loading} className="w-full mt-6">
          {loading ? t('common:loading') : t('onboarding:login')}
        </Button>

        <div className="mt-5 pt-4 border-t border-slate-100 text-center">
          <p className="text-sm text-slate-600">
            {t('onboarding:donthaveAccount')}{' '}
            <button
              type="button"
              onClick={() => navigate('/')}
              className="font-semibold text-indigo-700 hover:text-indigo-900"
            >
              {t('onboarding:register')}
            </button>
          </p>
        </div>
      </div>
    </AuthBackdrop>
  )
}
