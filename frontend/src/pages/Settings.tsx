import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-blue-600 text-white p-4">
        <div className="container mx-auto flex justify-between items-center">
          <h1 className="text-xl font-bold">{t('settings:title')}</h1>
          <button
            onClick={() => navigate('/home')}
            className="p-2"
            aria-label={t('common:back')}
          >
            ←
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto p-4">
        <Button onClick={onLogout} variant="secondary" className="w-full mb-6">
          {t('common:logout')}
        </Button>

        {/* Worker info */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <h2 className="font-semibold mb-4">{t('settings:workerInfo')}</h2>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-600">{t('settings:alias')}</span>
              <span>{worker.alias}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">{t('settings:language')}</span>
              <span>{worker.language}</span>
            </div>
          </div>
        </div>

        {/* Change PIN */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <h2 className="font-semibold mb-4">{t('settings:changePin')}</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                {t('settings:currentPin')}
              </label>
              <input
                id="current-pin"
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder={t('settings:enterCurrentPin')}
                className="w-full p-3 border rounded-lg"
                inputMode="numeric"
                maxLength={72}
                autoComplete="current-password"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">
                {t('settings:newPin')}
              </label>
              <input
                id="new-pin"
                type="password"
                value={newPin}
                onChange={(e) => setNewPin(e.target.value)}
                placeholder={t('settings:enterNewPin')}
                className="w-full p-3 border rounded-lg"
                inputMode="numeric"
                maxLength={4}
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">
                {t('settings:confirmNewPin')}
              </label>
              <input
                id="confirm-new-pin"
                type="password"
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value)}
                placeholder={t('settings:confirmNewPin')}
                className="w-full p-3 border rounded-lg"
                inputMode="numeric"
                maxLength={4}
                autoComplete="new-password"
              />
            </div>
            {pinError && (
              <p role="alert" className="text-sm text-red-700">{pinError}</p>
            )}
            {pinSuccess && (
              <p role="status" className="text-sm text-green-700">{pinSuccess}</p>
            )}
            <Button
              onClick={() => void handlePinChange()}
              disabled={changingPin}
              className="w-full"
            >
              {changingPin ? t('common:loading') : t('settings:savePin')}
            </Button>
          </div>
        </div>

        {/* Data deletion */}
        <div className="bg-red-50 rounded-lg shadow p-4 mb-6">
          <h2 className="font-semibold text-red-800 mb-4">
            {t('settings:deleteAccount')}
          </h2>
          <p className="text-sm text-red-700 mb-4">
            {t('settings:deleteAccountWarning')}
          </p>
          <Button
            onClick={handleDeleteAccount}
            className="w-full bg-red-600 text-white"
          >
            {t('settings:deleteAccount')}
          </Button>
        </div>

        {/* Language preference */}
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="font-semibold mb-4">{t('settings:language')}</h2>
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              {t('settings:languageDescription')}
            </p>
            <p className="text-sm font-medium">
              {t('settings:currentLanguage', { lang: worker.language })}
            </p>
            {languageError && (
              <p role="alert" className="text-sm text-red-700">{languageError}</p>
            )}
            <div className="grid grid-cols-2 gap-2">
              {SUPPORTED_LANGUAGE_OPTIONS.map((lang) => (
                <button
                  key={lang.code}
                  type="button"
                  disabled={changingLanguage}
                  onClick={() => void handleLanguageSelect(lang.code)}
                  className={`p-3 rounded-lg transition text-sm font-medium ${
                    worker.language === lang.code
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                  }`}
                >
                  {lang.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
