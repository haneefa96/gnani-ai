import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import Backend, { type HttpBackendOptions } from 'i18next-http-backend'

// Languages & top-level JSON sections exposed as i18next namespaces
const languages = ['en-IN', 'hi-IN', 'kn-IN', 'bn-IN']
const namespaces = [
  'common',
  'onboarding',
  'export',
  'home',
  'history',
  'settings',
  'contractor',
]

// Deduplicate parallel namespace fetches against single-file /locales/{{lng}}.json assets.
const localeCache = new Map<string, Promise<string>>()

function fetchLocaleOnce(url: string): Promise<string> {
  const existing = localeCache.get(url)
  if (existing) {
    return existing
  }
  const pending = fetch(url).then((res) => {
    if (!res.ok) {
      localeCache.delete(url)
      throw new Error(`Failed loading locale ${url}: ${res.status}`)
    }
    return res.text()
  })
  localeCache.set(url, pending)
  return pending
}

export function clearLocaleCache(): void {
  localeCache.clear()
}

const backendOptions: HttpBackendOptions = {
  loadPath: '/locales/{{lng}}.json',
  request(_options, url, _payload, callback) {
    fetchLocaleOnce(url)
      .then((data) => callback(null, { status: 200, data }))
      .catch((err) => callback(err, null))
  },
  parse(data, _languages, reqNamespaces) {
    const parsed = JSON.parse(data) as Record<string, Record<string, unknown>>
    const targetNs = Array.isArray(reqNamespaces) ? reqNamespaces[0] : reqNamespaces
    if (targetNs && targetNs in parsed) {
      return parsed[targetNs]
    }
    return parsed
  },
}

i18n
  .use(Backend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'en-IN',
    supportedLngs: languages,
    load: 'currentOnly',
    ns: namespaces,
    defaultNS: 'common',
    fallbackNS: 'common',
    nsSeparator: ':',
    keySeparator: '.',
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false,
    },
    backend: backendOptions,
  })

export default i18n
