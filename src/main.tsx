import { Component, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App'
import { AuthProvider } from './contexts/AuthContext'
import { queryClient } from './services/queryClient'
import { captureError, initObservability } from './services/observability'

const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0'

class ErrorBoundary extends Component<any, any> {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    captureError(error, { componentStack: info?.componentStack })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#0a0e1a] text-white">
          <p className="text-lg font-semibold">문제가 발생했습니다.</p>
          <button
            type="button"
            onClick={() => { this.setState({ hasError: false }); window.location.href = '/' }}
            className="rounded border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/20"
          >
            홈으로 돌아가기
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
)

// Defer Sentry off the critical path: only load @sentry/react after first paint,
// when the browser is idle. initObservability already no-ops without a DSN.
const startObservability = () => initObservability({ release: `coms-website@${APP_VERSION}` })
if (typeof requestIdleCallback === 'function') {
  requestIdleCallback(startObservability)
} else {
  setTimeout(startObservability, 0)
}
