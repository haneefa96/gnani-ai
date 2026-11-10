import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios'
import {
  api,
  AUTH_EXPIRED_EVENT,
  clearAuthSession,
  getAccessToken,
  getApiErrorMessage,
  getEntries,
  isJwtExpired,
  loginWorker,
  registerWorker,
  restoreAuthSession,
  storeAuthSession,
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
