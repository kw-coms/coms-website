import type { ComponentType, ReactNode } from 'react'
import { AlertCircle } from 'lucide-react'

type ErrorStateProps = {
  title?: string
  message?: ReactNode
  onRetry?: () => void
  retryLabel?: string
  icon?: ComponentType<{ size?: number }>
  className?: string
}

/**
 * Standard icon + heading + message panel for failed fetches, styled to match
 * the app's existing empty-state convention (see .activity-empty-state used
 * in ClubEventSection/ActivityLogSection/ClubCalendarSection). Renders an
 * optional retry button when `onRetry` is provided.
 */
export default function ErrorState({
  title = '불러오지 못했습니다.',
  message,
  onRetry,
  retryLabel = '다시 시도',
  icon: Icon = AlertCircle,
  className = '',
}: ErrorStateProps) {
  return (
    <div className={['coms-error-state', className].filter(Boolean).join(' ')} role="alert">
      <Icon size={22} aria-hidden="true" />
      <div>
        <h3>{title}</h3>
        {message && <p>{message}</p>}
        {onRetry && (
          <button type="button" onClick={onRetry} className="apple-action-secondary coms-error-state-retry">
            {retryLabel}
          </button>
        )}
      </div>
    </div>
  )
}
