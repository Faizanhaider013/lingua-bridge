import { useEffect, useState } from 'react'
import { pingBackend } from '../lib/translate'

export type BackendStatus = 'checking' | 'online' | 'offline'

interface Options {
  /** Poll interval in ms (default 15s — frequent enough to recover, light enough
   * to avoid hammering the free provider's host). */
  intervalMs?: number
}

/**
 * Tracks whether the backend's `/health` endpoint is reachable.
 *
 * Checks once on mount, then polls on an interval, and also re-checks when the
 * tab regains focus or the browser reports the network is back — so recovery is
 * quick without constant polling. Overlapping checks are aborted to avoid
 * duplicate in-flight requests, and everything is cleaned up on unmount (no
 * leaks). It never blocks the UI; callers use the status for display only.
 */
export function useBackendHealth({ intervalMs = 15_000 }: Options = {}): BackendStatus {
  const [status, setStatus] = useState<BackendStatus>('checking')

  useEffect(() => {
    let cancelled = false
    let inFlight: AbortController | null = null

    const check = async () => {
      inFlight?.abort() // cancel any still-running check before starting another
      const controller = new AbortController()
      inFlight = controller
      try {
        const ok = await pingBackend(controller.signal)
        if (!cancelled) setStatus(ok ? 'online' : 'offline')
      } catch (err) {
        // An aborted check is a superseded one — ignore it, don't flip state.
        if ((err as Error | undefined)?.name === 'AbortError') return
        if (!cancelled) setStatus('offline')
      }
    }

    void check()
    const timer = window.setInterval(() => void check(), intervalMs)
    const onWake = () => void check()
    window.addEventListener('focus', onWake)
    window.addEventListener('online', onWake)

    return () => {
      cancelled = true
      inFlight?.abort()
      window.clearInterval(timer)
      window.removeEventListener('focus', onWake)
      window.removeEventListener('online', onWake)
    }
  }, [intervalMs])

  return status
}
