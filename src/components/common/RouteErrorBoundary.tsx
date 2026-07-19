import { Component } from 'react'
import type { ReactNode } from 'react'
import ErrorState from './ErrorState'
import { captureError } from '../../services/observability'

type RouteErrorBoundaryProps = { children: ReactNode }
type RouteErrorBoundaryState = { hasError: boolean }

/**
 * Route-level error boundary. Mirrors the app-root boundary in main.tsx, but
 * renders inline — GlobalNavigation/AppearanceControl/ToastHost stay mounted
 * around it — and lets the user retry in place instead of a full reload.
 * Mounted once around the routed content in App.tsx, not per-route.
 */
export default class RouteErrorBoundary extends Component<RouteErrorBoundaryProps, RouteErrorBoundaryState> {
  state: RouteErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    captureError(error, { componentStack: info?.componentStack })
  }

  handleRetry = () => {
    this.setState({ hasError: false })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
          <ErrorState
            title="페이지를 표시할 수 없습니다."
            message="일시적인 오류가 발생했습니다. 다시 시도해주세요."
            onRetry={this.handleRetry}
          />
        </div>
      )
    }
    return this.props.children
  }
}
