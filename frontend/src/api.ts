import axios, { type InternalAxiosRequestConfig } from 'axios'

const ACCESS_TOKEN_KEY = 'saakshi_access_token'
const PROFILE_KEY = 'saakshi_worker_profile'
const LEGACY_WORKER_KEY = 'saakshi_worker'

export const AUTH_EXPIRED_EVENT = 'saakshi:auth-expired'

export interface AuthResponse {
  access_token: string
  token_type: 'bearer'
  worker_id: number
}

export interface WorkerProfile {
  alias: string
  language: string
}

export interface WageEntry {
  id: number
  work_date: string
  site_name: string | null
  counterparty_name: string | null
  hours: number | null
  days: number | null
  agreed_inr: number
  paid_inr: number
  due_inr: number
  language: string
  transcript: string | null
  status: string
  created_at: string
}

interface StoredProfile {
  alias?: unknown
  language?: unknown
}

export const api = axios.create({ baseURL: '/api' })

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY)
}

export function isJwtExpired(token: string): boolean {
  try {
    const encodedPayload = token.split('.')[1]
    if (!encodedPayload) return true

    const base64 = encodedPayload.replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='))) as {
      exp?: unknown
    }

    return typeof payload.exp !== 'number' || payload.exp * 1000 <= Date.now()
  } catch {
    return true
  }
}

export function storeAuthSession(token: string, profile: WorkerProfile): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, token)
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile))
  localStorage.removeItem(LEGACY_WORKER_KEY)
}

export function restoreAuthSession(): WorkerProfile | null {
  localStorage.removeItem(LEGACY_WORKER_KEY)
  const token = getAccessToken()

  if (!token || isJwtExpired(token)) {
    clearAuthSession()
    return null
  }

  const storedProfile = localStorage.getItem(PROFILE_KEY)
  if (!storedProfile) return { alias: 'Worker', language: 'hi-IN' }

  try {
    const profile = JSON.parse(storedProfile) as StoredProfile
    return {
      alias: typeof profile.alias === 'string' ? profile.alias : 'Worker',
      language: typeof profile.language === 'string' ? profile.language : 'hi-IN',
    }
  } catch {
    localStorage.removeItem(PROFILE_KEY)
    return { alias: 'Worker', language: 'hi-IN' }
  }
}

export function clearAuthSession(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY)
  localStorage.removeItem(PROFILE_KEY)
  localStorage.removeItem(LEGACY_WORKER_KEY)
}

export async function registerWorker(
  alias: string,
  pin: string,
  language: string,
): Promise<AuthResponse> {
  const response = await api.post<AuthResponse>('/auth/register', { alias, pin, language })
  return response.data
}

export async function loginWorker(alias: string, pin: string): Promise<AuthResponse> {
  const response = await api.post<AuthResponse>('/auth/login', { alias, pin })
  return response.data
}

export async function getEntries(): Promise<WageEntry[]> {
  const response = await api.get<WageEntry[]>('/entries/')
  if (!Array.isArray(response.data)) {
    throw new Error('Unexpected entries response')
  }
  return response.data
}

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError<{ detail?: unknown }>(error)) {
    const detail = error.response?.data?.detail
    if (typeof detail === 'string') return detail
  }

  return fallback
}

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAccessToken()
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`)
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (
      axios.isAxiosError(error) &&
      error.response?.status === 401 &&
      error.config?.url !== '/auth/login' &&
      error.config?.url !== '/auth/register'
    ) {
      clearAuthSession()
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT))
      }
    }

    return Promise.reject(error)
  },
)
