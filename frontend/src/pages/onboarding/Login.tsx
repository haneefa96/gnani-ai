import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/Button'

export default function Login({ onLogin }: { onLogin: (worker: any) => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [alias, setAlias] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')

  const handleLogin = async () => {
    if (!alias || !pin) {
      setError(t('onboarding:emptyFields'))
      return
    }

    if (pin.length !== 4) {
      setError(t('onboarding:pinMustBe4Digits'))
      return
    }

    // In real implementation, call login API
    setError('')
    const mockWorker = {
      id: 1,
      alias: alias,
      pin_hash: 'mock-pin-hash',
      language: 'hi-IN',
    }
    onLogin(mockWorker)
    navigate('/home')
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
        <h1 className="text-2xl font-bold mb-6 text-center">
          {t('onboarding:welcomeBack')}
        </h1>

        {error && (
          <div className="bg-red-50 text-red-700 p-3 rounded-lg mb-4 text-sm">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              {t('onboarding:alias')}
            </label>
            <input
              type="text"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              placeholder={t('onboarding:enterAlias')}
              className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              {t('onboarding:pin')}
            </label>
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="••••"
              className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
              maxLength={4}
            />
          </div>
        </div>

        <Button onClick={handleLogin} className="w-full mt-6">
          {t('onboarding:login')}
        </Button>

        <div className="mt-4 text-center">
          <p className="text-sm text-gray-600">
            {t('onboarding:donthaveAccount')}{' '}
            <button
              onClick={() => navigate('/')}
              className="text-blue-600 hover:text-blue-800"
            >
              {t('onboarding:register')}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
