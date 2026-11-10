import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '../components/Button'

export default function ContractorThanks() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
        <div className="text-6xl mb-4">✓</div>
        <h2 className="text-2xl font-bold mb-4">{t('contractor:thanksTitle')}</h2>
        <p className="text-gray-600 mb-6">
          {t('contractor:thanksDescription')}
        </p>
        <Button
          onClick={() => navigate('/')}
          className="w-full"
        >
          {t('common:back')}
        </Button>
      </div>
    </div>
  )
}
