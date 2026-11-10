// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AxiosHeaders, type InternalAxiosRequestConfig } from 'axios'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api'
import Home from './Home'

const mockNavigate = vi.fn()
const useEntriesMock = vi.fn()
const notifyMock = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

const mockTranslationObj = {
  t: (key: string, opts?: string | Record<string, unknown>) =>
    typeof opts === 'string' ? opts : key,
}

vi.mock('react-i18next', () => ({
  useTranslation: () => mockTranslationObj,
}))

vi.mock('../useEntries', () => ({
  useEntries: () => useEntriesMock(),
  notifyEntriesUpdated: () => notifyMock(),
}))

vi.mock('../voice/VoiceButton', () => ({
  VoiceButton: ({
    label,
    onAudioSaved,
    onTranscript,
  }: {
    label?: string
    onAudioSaved?: (saved: { audio_ref: string; sha256: string; duration_ms: number }) => void
    onTranscript?: (transcript: string, detectedLang: string | null) => void
  }) => (
    <button
      type="button"
      onClick={() => {
        onAudioSaved?.({
          audio_ref: 'data/audio/narration/clip.wav',
          sha256: 'a'.repeat(64),
          duration_ms: 1200,
        })
        onTranscript?.('Aaj Basavanagudi site pe 700 bola 300 diya', 'hi-IN')
      }}
    >
      {label}
    </button>
  ),
}))

vi.mock('../voice/TtsPlayer', () => ({
  TtsPlayer: ({ text }: { text?: string | null }) => <div data-testid="tts-player">{text}</div>,
}))

describe('Home voice-to-ledger integration', () => {
  const defaultAdapter = api.defaults.adapter

  afterEach(() => {
    api.defaults.adapter = defaultAdapter
    cleanup()
    vi.clearAllMocks()
  })

  it('extracts voice transcript, creates draft, confirms entry, and notifies entries refresh', async () => {
    useEntriesMock.mockReturnValue({
      entries: [],
      loading: false,
      error: null,
      refresh: vi.fn(),
    })

    const sentCalls: Array<{ url?: string; data?: unknown }> = []
    api.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      const parsedData = config.data ? JSON.parse(String(config.data)) : undefined
      sentCalls.push({ url: config.url, data: parsedData })

      if (config.url === '/voice/extract') {
        return {
          status: 200,
          statusText: 'OK',
          headers: new AxiosHeaders(),
          config,
          data: {
            work_date: '2026-11-10',
            site_name: 'Basavanagudi',
            counterparty_name: 'Suresh',
            work_type: null,
            hours: 8,
            days: null,
            agreed_amount_inr: 700,
            paid_amount_inr: 300,
            due_amount_inr: 400,
            stated_due_amount_inr: null,
            needs_clarification: [],
            clarification_question: null,
            language: 'hi-IN',
            manual_correction_required: false,
          },
        }
      }
      if (config.url === '/entries/draft') {
        return {
          status: 201,
          statusText: 'Created',
          headers: new AxiosHeaders(),
          config,
          data: { id: 15, status: 'DRAFT', due_inr: 400 },
        }
      }
      if (config.url === '/entries/15/confirm') {
        return {
          status: 200,
          statusText: 'OK',
          headers: new AxiosHeaders(),
          config,
          data: { id: 15, status: 'WORKER_CONFIRMED', due_inr: 400 },
        }
      }
      throw new Error(`Unexpected API call: ${config.url}`)
    }

    render(
      <MemoryRouter>
        <Home worker={{ alias: 'ramesh', language: 'hi-IN' }} />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByText('home:recordEntry'))
    await waitFor(() => expect(screen.getByText('Basavanagudi')).toBeTruthy())

    fireEvent.click(screen.getByText('Confirm'))
    await waitFor(() =>
      expect(screen.getByText('Entry saved and confirmed to your ledger.')).toBeTruthy(),
    )

    expect(sentCalls[0]?.url).toBe('/voice/extract')
    expect(sentCalls[1]).toEqual({
      url: '/entries/draft',
      data: {
        audio_ref: 'data/audio/narration/clip.wav',
        audio_sha256: 'a'.repeat(64),
        transcript: 'Aaj Basavanagudi site pe 700 bola 300 diya',
        lang: 'hi-IN',
        work_date: '2026-11-10',
        site_name: 'Basavanagudi',
        counterparty_name: 'Suresh',
        work_type: null,
        hours: 8,
        days: null,
        agreed_inr: 700,
        paid_inr: 300,
      },
    })
    expect(sentCalls[2]?.url).toBe('/entries/15/confirm')
    expect(notifyMock).toHaveBeenCalledTimes(1)
  })
})
