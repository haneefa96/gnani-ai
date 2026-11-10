import { useCallback, useEffect, useState } from 'react'
import { getApiErrorMessage, getEntries, type WageEntry } from './api'

export const ENTRIES_UPDATED_EVENT = 'saakshi:entries-updated'

export function notifyEntriesUpdated(): void {
  window.dispatchEvent(new Event(ENTRIES_UPDATED_EVENT))
}

export function useEntries() {
  const [entries, setEntries] = useState<WageEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setEntries(await getEntries())
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'Unable to load entries.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const handleFocus = () => void refresh()
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void refresh()
    }

    window.addEventListener('focus', handleFocus)
    window.addEventListener(ENTRIES_UPDATED_EVENT, handleFocus)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener(ENTRIES_UPDATED_EVENT, handleFocus)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [refresh])

  return { entries, loading, error, refresh }
}
