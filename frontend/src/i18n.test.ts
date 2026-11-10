// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

const EN_LOCALE = {
  common: { retry: 'Retry', loading: 'Loading...' },
  onboarding: { login: 'Login' },
  export: { title: 'Export Evidence Pack', generate: 'Generate' },
  home: {
    description: 'Record your daily wage entries',
    worker: 'Worker: {{worker}}',
    recordEntry: 'Hold to Record',
  },
  history: {
    statuses: { DRAFT: 'Draft', LOGGED: 'Logged' },
  },
  settings: { title: 'Settings' },
  contractor: { contractorPage: 'Contractor Verification' },
}

const HI_LOCALE = {
  common: { retry: 'पुनः प्रयास करें', loading: 'लोड हो रहा है...' },
  onboarding: { login: 'लॉगिन' },
  export: { title: 'साक्ष्य पैक निर्यात करें', generate: 'जेनरेट करें' },
  home: {
    description: 'अपनी दैनिक वेतन प्रविष्टियाँ रिकॉर्ड करें',
    worker: 'श्रमिक: {{worker}}',
    recordEntry: 'रिकॉर्ड करने के लिए दबाएं',
  },
  history: {
    statuses: { DRAFT: 'ड्राफ्ट', LOGGED: 'लॉग किया गया' },
  },
  settings: { title: 'सेटिंग्स' },
  contractor: { contractorPage: 'ठेकेदार सत्यापन' },
}

describe('i18n single-file locale loading', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.resetModules()
    window.localStorage.clear()
  })

  it('resolves home/history/export namespaced keys from /locales/{{lng}}.json in a single fetch', async () => {
    vi.spyOn(window.navigator, 'language', 'get').mockReturnValue('en-US')

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url === '/locales/en-IN.json') {
        return new Response(JSON.stringify(EN_LOCALE), { status: 200 })
      }
      if (url === '/locales/hi-IN.json') {
        return new Response(JSON.stringify(HI_LOCALE), { status: 200 })
      }
      return new Response('Not found', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const { default: i18n, clearLocaleCache } = await import('./i18n')
    await i18n.loadNamespaces(['common', 'home', 'history', 'export'])

    expect(i18n.t('home:description')).toBe('Record your daily wage entries')
    expect(i18n.t('home:worker', { worker: 'Shamaz' })).toBe('Worker: Shamaz')
    expect(i18n.t('home:recordEntry')).toBe('Hold to Record')
    expect(i18n.t('history:statuses.DRAFT')).toBe('Draft')
    expect(i18n.t('export:title')).toBe('Export Evidence Pack')

    const enCalls = fetchMock.mock.calls.filter(([u]) => u === '/locales/en-IN.json')
    expect(enCalls).toHaveLength(1)

    await i18n.changeLanguage('hi-IN')
    expect(i18n.t('home:recordEntry')).toBe('रिकॉर्ड करने के लिए दबाएं')
    const hiCalls = fetchMock.mock.calls.filter(([u]) => u === '/locales/hi-IN.json')
    expect(hiCalls).toHaveLength(1)

    clearLocaleCache()
  })
})
