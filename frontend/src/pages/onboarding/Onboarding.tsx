import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/Button'

const languages = [
  { code: 'hi-IN', name: 'Hindi' },
  { code: 'kn-IN', name: 'Kannada' },
  { code: 'bn-IN', name: 'Bengali' },
  { code: 'en-IN', name: 'English' },
]

export default function Onboarding({ onLogin }: { onLogin: (worker: any) => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [selectedLanguage, setSelectedLanguage] = useState('hi-IN')
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [step, setStep] = useState(1)

  const handleLanguageChange = (code: string) => {
    setSelectedLanguage(code)
  }

  const handlePinSetup = () => {
    if (pin.length !== 4) {
      alert(t('onboarding:pinMustBe4Digits'))
      return
    }
    if (pin !== confirmPin) {
      alert(t('onboarding:pinsDoNotMatch'))
      return
    }
    // In real implementation, register with backend
    onLogin({
      alias: 'worker-' + Math.random().toString(36).substring(7),
      pin_hash: 'mock-pin-hash',
      language: selectedLanguage,
    })
    navigate('/home')
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
        <h1 className="text-2xl font-bold mb-6 text-center">
          {step === 1 ? t('onboarding:welcome') : t('onboarding:setPin')}
        </h1>

        {step === 1 && (
          <>
            <p className="mb-6">{t('onboarding:chooseLanguage')}</p>
            <div className="space-y-2">
              {languages.map((lang) => (
                <button
                  key={lang.code}
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
              onClick={() => setStep(2)}
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
                className="flex-1"
              >
                {t('common:save')}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
