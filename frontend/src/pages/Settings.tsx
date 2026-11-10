import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/Button'

export default function Settings({ worker }: { worker: any }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [pin, setPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')

  const handlePinChange = () => {
    // In real implementation, update PIN via API
    alert('PIN change feature coming soon!')
  }

  const handleDeleteAccount = () => {
    if (confirm(t('settings:deleteAccountConfirm'))) {
      // In real implementation, delete account via API
      localStorage.removeItem('saakshi_worker')
      navigate('/')
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
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder={t('settings:enterCurrentPin')}
                className="w-full p-3 border rounded-lg"
                maxLength={4}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">
                {t('settings:newPin')}
              </label>
              <input
                type="password"
                value={newPin}
                onChange={(e) => setNewPin(e.target.value)}
                placeholder={t('settings:enterNewPin')}
                className="w-full p-3 border rounded-lg"
                maxLength={4}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">
                {t('settings:confirmNewPin')}
              </label>
              <input
                type="password"
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value)}
                placeholder={t('settings:confirmNewPin')}
                className="w-full p-3 border rounded-lg"
                maxLength={4}
              />
            </div>
            <Button onClick={handlePinChange} className="w-full">
              {t('settings:savePin')}
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
          <div className="space-y-2">
            <p className="text-sm text-gray-600">
              {t('settings:languageDescription')}
            </p>
            <p className="text-sm font-medium">
              {t('settings:currentLanguage', { lang: worker.language })}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
