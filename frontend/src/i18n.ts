import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import Backend from 'i18next-http-backend'

// Languages
const languages = ['en-IN', 'hi-IN', 'kn-IN', 'bn-IN']

i18n
  .use(Backend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'en-IN',
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
    lng: 'en-IN',
    supportedLngs: languages,
    interpolation: {
      escapeValue: false,
    },
    backend: {
      loadPath: '/locales/{{lng}}.json',
    },
  })

export default i18n
