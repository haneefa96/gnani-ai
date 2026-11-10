import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios'
import {
  api,
  AUTH_EXPIRED_EVENT,
  changeWorkerPin,
  clearAuthSession,
  confirmVoiceDraft,
  createVoiceDraft,
  getAccessToken,
  getApiErrorMessage,
  getContractorApiErrorMessage,
  getContractorEntry,
  getEntries,
  isJwtExpired,
  loginWorker,
  registerWorker,
  restoreAuthSession,
  storeAuthSession,
  submitContractorResponse,
} from './api'

const accessToken = 'test.access.token'
const responseData = {
  access_token: accessToken,
  token_type: 'bearer' as const,
  worker_id: 7,
}

function createJwt(exp: number): string {
  const payload = btoa(JSON.stringify({ exp }))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
  return `header.${payload}.signature`
}

function errorAdapter(status: number, detail: string) {
  return async (config: InternalAxiosRequestConfig) => {
    const response = {
      data: { detail },
      status,
      statusText: 'Request failed',
      headers: new AxiosHeaders(),
      config,
    }
    throw new AxiosError(
      detail,
      AxiosError.ERR_BAD_REQUEST,
      config,
      undefined,
      response,
    )
  }
}

describe('frontend authentication client', () => {
  let storage: Map<string, string>

  beforeEach(() => {
    storage = new Map()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    })
    vi.stubGlobal('window', { dispatchEvent: vi.fn() })
    clearAuthSession()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('registers with alias, PIN and language and persists only the token/profile', async () => {
    let requestBody: unknown
    api.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      requestBody = JSON.parse(config.data as string)
      return {
        data: responseData,
        status: 201,
        statusText: 'Created',
        headers: new AxiosHeaders(),
        config,
      }
    }
    const result = await registerWorker('worker-one', '1234', 'kn-IN')
    storeAuthSession(result.access_token, { alias: 'worker-one', language: 'kn-IN' })

    expect(result).toEqual(responseData)
    expect(requestBody).toEqual({ alias: 'worker-one', pin: '1234', language: 'kn-IN' })
    expect(storage.get('saakshi_access_token')).toBe(accessToken)
    expect(storage.get('saakshi_worker_profile')).toBe(
      JSON.stringify({ alias: 'worker-one', language: 'kn-IN' }),
    )
    expect([...storage.values()].join(' ')).not.toContain('1234')

    let loginBody: unknown
    api.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      loginBody = JSON.parse(config.data as string)
      return {
        data: responseData,
        status: 200,
        statusText: 'OK',
        headers: new AxiosHeaders(),
        config,
      }
    }
    const loginResult = await loginWorker('worker-one', '1234')
    expect(loginResult).toEqual(responseData)
    expect(loginBody).toEqual({ alias: 'worker-one', pin: '1234' })
  })

  it('surfaces duplicate-alias and incorrect-PIN API responses without storing credentials', async () => {
    api.defaults.adapter = errorAdapter(400, 'Alias already registered')
    await expect(registerWorker('worker-one', '1234', 'hi-IN')).rejects.toSatisfy(
      (error: unknown) => getApiErrorMessage(error, 'fallback') === 'Alias already registered',
    )

    api.defaults.adapter = errorAdapter(401, 'Invalid alias or PIN')
    await expect(loginWorker('worker-one', '9999')).rejects.toSatisfy(
      (error: unknown) => getApiErrorMessage(error, 'fallback') === 'Invalid alias or PIN',
    )
    expect(getAccessToken()).toBeNull()
    expect([...storage.values()].join(' ')).not.toContain('9999')
  })

  it('submits a PIN change through the authenticated client without persisting PINs', async () => {
    const validToken = createJwt(Math.floor(Date.now() / 1000) + 60)
    storeAuthSession(validToken, { alias: 'worker-one', language: 'en-IN' })
    let requestBody: unknown
    let authorizationHeader: string | undefined
    api.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      requestBody = JSON.parse(config.data as string)
      const header = config.headers.get('Authorization')
      authorizationHeader = typeof header === 'string' ? header : undefined
      return {
        data: { status: 'updated' },
        status: 200,
        statusText: 'OK',
        headers: new AxiosHeaders(),
        config,
      }
    }

    await expect(changeWorkerPin('1234', '5678')).resolves.toBeUndefined()
    expect(requestBody).toEqual({ current_pin: '1234', new_pin: '5678' })
    expect(authorizationHeader).toBe(`Bearer ${validToken}`)
    expect([...storage.values()].join(' ')).not.toContain('1234')
    expect([...storage.values()].join(' ')).not.toContain('5678')

    api.defaults.adapter = errorAdapter(403, 'Current PIN verification failed')
    await expect(changeWorkerPin('9999', '5678')).rejects.toBeInstanceOf(AxiosError)
    expect(getAccessToken()).toBe(validToken)
  })

  it('restores a valid JWT profile and clears expired, malformed and legacy sessions', () => {
    const validToken = createJwt(Math.floor(Date.now() / 1000) + 60)
    storeAuthSession(validToken, { alias: 'worker-one', language: 'bn-IN' })
    expect(restoreAuthSession()).toEqual({ alias: 'worker-one', language: 'bn-IN' })
    expect(isJwtExpired(validToken)).toBe(false)

    storage.set('saakshi_access_token', createJwt(Math.floor(Date.now() / 1000) - 60))
    storage.set('saakshi_worker', JSON.stringify({ id: 1 }))
    expect(restoreAuthSession()).toBeNull()
    expect(getAccessToken()).toBeNull()
    expect(storage.has('saakshi_worker')).toBe(false)
    expect(isJwtExpired('malformed')).toBe(true)
  })

  it('attaches bearer tokens and clears the session when a protected API request returns 401', async () => {
    const validToken = createJwt(Math.floor(Date.now() / 1000) + 60)
    storeAuthSession(validToken, { alias: 'worker-one', language: 'en-IN' })
    let authorizationHeader: string | undefined
    api.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      const header = config.headers.get('Authorization')
      authorizationHeader = typeof header === 'string' ? header : undefined
      return {
        data: {},
        status: 200,
        statusText: 'OK',
        headers: new AxiosHeaders(),
        config,
      }
    }
    await api.get('/entries/')
    expect(authorizationHeader).toBe(`Bearer ${validToken}`)

    api.defaults.adapter = errorAdapter(401, 'Token expired')
    await expect(api.get('/entries/')).rejects.toBeInstanceOf(AxiosError)
    expect(getAccessToken()).toBeNull()
    expect(window.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: AUTH_EXPIRED_EVENT }),
    )
  })

  it('loads the actual entry response from the authenticated entries endpoint', async () => {
    const entries = [{
      id: 21,
      work_date: '2026-11-10',
      site_name: 'Actual site',
      counterparty_name: null,
      hours: 7,
      days: null,
      agreed_inr: 750,
      paid_inr: 200,
      due_inr: 550,
      language: 'en-IN',
      transcript: 'backend response',
      status: 'DRAFT',
      created_at: '2026-11-10T12:00:00',
    }]
    let requestUrl = ''
    api.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      requestUrl = config.url ?? ''
      return {
        data: entries,
        status: 200,
        statusText: 'OK',
        headers: new AxiosHeaders(),
        config,
      }
    }

    await expect(getEntries()).resolves.toEqual(entries)
    expect(requestUrl).toBe('/entries/')
  })

  it('uploads the recorded blob and submits its reviewed confirmation with authentication', async () => {
    storeAuthSession(createJwt(Math.floor(Date.now() / 1000) + 60), {
      alias: 'worker-one',
      language: 'en-IN',
    })
    const audio = new Blob(['test audio'], { type: 'audio/webm' })
    const draft = {
      draft_token: 'signed-draft',
      transcript: 'Demo transcript',
      work_date: '2026-11-10',
      site_name: 'Demo Site',
      counterparty_name: 'Demo Contractor',
      work_type: null,
      hours: 8,
      days: null,
      agreed_amount_inr: 1200,
      paid_amount_inr: 300,
      due_amount_inr: 900,
      language: 'en-IN',
      detected_language_code: 'en-IN',
      field_confidence: {},
      needs_clarification: [],
      clarification_question: null,
      voice_mode: 'fake' as const,
    }
    const requests: Array<{
      url: string
      contentType: unknown
      authorization: unknown
      data: unknown
    }> = []
    api.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      requests.push({
        url: config.url ?? '',
        contentType: config.headers.get('Content-Type'),
        authorization: config.headers.get('Authorization'),
        data: config.data,
      })
      return {
        data: requests.length === 1
          ? draft
          : {
              id: 21,
              work_date: '2026-11-10',
              site_name: 'Demo Site',
              counterparty_name: 'Demo Contractor',
              hours: 8,
              days: null,
              agreed_inr: 1200,
              paid_inr: 300,
              due_inr: 900,
              language: 'en-IN',
              transcript: 'Demo transcript',
              status: 'WORKER_CONFIRMED',
              created_at: '2026-11-10T12:00:00',
            },
        status: requests.length === 1 ? 200 : 201,
        statusText: 'OK',
        headers: new AxiosHeaders(),
        config,
      }
    }

    await expect(createVoiceDraft(audio)).resolves.toEqual(draft)
    await expect(confirmVoiceDraft(draft, audio, {
      work_date: '2026-11-10',
      site_name: 'Demo Site',
      counterparty_name: 'Demo Contractor',
      work_type: null,
      hours: 8,
      days: null,
      agreed_amount_inr: 1200,
      paid_amount_inr: 300,
      language: 'en-IN',
    })).resolves.toMatchObject({ status: 'WORKER_CONFIRMED', due_inr: 900 })

    expect(requests.map(({ url }) => url)).toEqual([
      '/entries/draft',
      '/entries/draft/confirm',
    ])
    expect(requests[0].contentType).toBe('audio/webm')
    expect(requests[0].data).toBe(audio)
    expect(requests.map(({ authorization }) =>
      typeof authorization === 'string' && authorization.startsWith('Bearer '),
    )).toEqual([true, true])
    expect(JSON.parse(requests[1].data as string)).toMatchObject({
      draft_token: 'signed-draft',
      audio_base64: btoa('test audio'),
      agreed_amount_inr: 1200,
      paid_amount_inr: 300,
    })
  })

  it('uses the share token without sending worker auth and supports each contractor response', async () => {
    storeAuthSession(createJwt(Math.floor(Date.now() / 1000) + 60), {
      alias: 'worker-one',
      language: 'en-IN',
    })
    const requests: Array<{ url: string; auth: unknown; body?: unknown }> = []
    let responseCount = 0
    const results = [
      { status: 'CONTRACTOR_CONFIRMED' },
      { status: 'UNCONFIRMED' },
      { status: 'CONTRACTOR_DISPUTED' },
    ]
    api.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      requests.push({
        url: config.url ?? '',
        auth: config.headers.get('Authorization'),
        body: config.data ? JSON.parse(config.data as string) : undefined,
      })
      const data = responseCount === 0
        ? { entry_text: 'Actual contractor entry', language: 'hi-IN', entry_id: 23 }
        : results[responseCount - 1]
      responseCount += 1
      return {
        data,
        status: 200,
        statusText: 'OK',
        headers: new AxiosHeaders(),
        config,
      }
    }

    await expect(getContractorEntry('share token')).resolves.toEqual({
      entry_text: 'Actual contractor entry',
      language: 'hi-IN',
      entry_id: 23,
    })
    await expect(submitContractorResponse('share token', 'yes')).resolves.toEqual(results[0])
    await expect(submitContractorResponse('share token', 'no')).resolves.toEqual(results[1])
    await expect(
      submitContractorResponse('share token', 'dispute', '  Wage differs  '),
    ).resolves.toEqual(results[2])

    expect(requests.map(({ url }) => url)).toEqual([
      '/contractor/share%20token',
      '/contractor/share%20token/respond',
      '/contractor/share%20token/respond',
      '/contractor/share%20token/respond',
    ])
    expect(requests.every(({ auth }) => auth === undefined)).toBe(true)
    expect(requests.slice(1).map(({ body }) => body)).toEqual([
      { result: 'yes' },
      { result: 'no' },
      { result: 'dispute', reason_text: 'Wage differs' },
    ])
  })

  it('handles invalid and consumed contractor share tokens as unavailable', async () => {
    api.defaults.adapter = errorAdapter(404, 'Invalid or expired token')
    await expect(getContractorEntry('missing')).rejects.toSatisfy(
      (error: unknown) =>
        getContractorApiErrorMessage(error, 'Link unavailable') === 'Link unavailable',
    )
  })

  it('does not log the user out for an incorrect login PIN', async () => {
    const validToken = createJwt(Math.floor(Date.now() / 1000) + 60)
    storeAuthSession(validToken, { alias: 'worker-one', language: 'en-IN' })
    api.defaults.adapter = errorAdapter(401, 'Invalid alias or PIN')

    await expect(loginWorker('worker-one', '9999')).rejects.toBeInstanceOf(AxiosError)
    expect(getAccessToken()).toBe(validToken)
  })

  it('clears persisted authentication on logout', () => {
    storeAuthSession(createJwt(Math.floor(Date.now() / 1000) + 60), {
      alias: 'worker-one',
      language: 'en-IN',
    })

    clearAuthSession()

    expect(getAccessToken()).toBeNull()
    expect(storage.has('saakshi_worker_profile')).toBe(false)
  })
})
