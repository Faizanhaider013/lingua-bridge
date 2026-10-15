import { CloudOff } from 'lucide-react'
import type { BackendStatus } from '../hooks/useBackendHealth'

interface BackendStatusBannerProps {
  status: BackendStatus
}

/**
 * A slim, unobtrusive banner shown only while the backend is unreachable. It
 * reassures the user that nothing is lost and recovery is automatic, without
 * exposing any technical detail. It never blocks typing — purely informational.
 * While still checking (or online) it renders nothing, so it doesn't flash on
 * load.
 */
export function BackendStatusBanner({ status }: BackendStatusBannerProps) {
  if (status !== 'offline') return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="mt-3 flex items-center gap-2.5 border border-orange/40 bg-orange/10 px-4 py-2 font-mono text-[11px] leading-relaxed text-ink"
    >
      <CloudOff className="size-3.5 shrink-0 text-rust" aria-hidden />
      <span>
        <strong className="font-semibold uppercase tracking-[0.08em]">
          Translation offline
        </strong>{' '}
        — the translation service can’t be reached right now. You can keep typing;
        your messages stay in this tab. Connection checking resumes automatically.
        When the service is back, choose Retry on any failed message.
      </span>
    </div>
  )
}
