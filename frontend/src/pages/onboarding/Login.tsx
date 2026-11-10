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
      <div className="obsidian-card relative w-full rounded-3xl overflow-hidden p-6 sm:p-8">
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400/60 to-transparent"
        />
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-white tracking-tight">
            {t('onboarding:welcomeBack')}
          </h1>
        </div>

        {error && (
          <div
            role="alert"
            className="bg-rose-500/10 border border-rose-500/30 text-rose-300 p-3 rounded-xl mb-4 text-sm"
          >
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
              {t('onboarding:alias')}
            </label>
            <input
              type="text"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              placeholder={t('onboarding:enterAlias')}
              className="w-full px-3.5 py-2.5 border border-zinc-800 rounded-xl bg-zinc-950/90 text-zinc-100 placeholder:text-zinc-500 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 focus:outline-none transition"
              maxLength={50}
              autoComplete="username"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
              {t('onboarding:pin')}
            </label>
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="••••"
              className="w-full px-3.5 py-2.5 border border-zinc-800 rounded-xl bg-zinc-950/90 text-zinc-100 placeholder:text-zinc-600 text-center font-mono tracking-[0.45em] focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 focus:outline-none transition"
              inputMode="numeric"
              maxLength={4}
            />
          </div>
        </div>

        <Button onClick={handleLogin} disabled={loading} className="w-full mt-6">
          {loading ? t('common:loading') : t('onboarding:login')}
        </Button>

        <div className="mt-5 pt-4 border-t border-white/[0.08] text-center">
          <p className="text-sm text-zinc-400">
            {t('onboarding:donthaveAccount')}{' '}
            <button
              type="button"
              onClick={() => navigate('/')}
              className="font-semibold text-cyan-400 hover:text-cyan-300 transition-colors"
            >
              {t('onboarding:register')}
            </button>
          </p>
        </div>
      </div>
    </AuthBackdrop>
  )
}
