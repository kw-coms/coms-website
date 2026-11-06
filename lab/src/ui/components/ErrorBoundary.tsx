import { Component, type ErrorInfo, type ReactNode } from 'react';

/** Keeps a render failure (e.g. WebGL unavailable) from blanking the whole page. */
export class ErrorBoundary extends Component<{ fallback: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }
  render() {
    return this.state.failed ? <div className="boundary" role="alert">{this.props.fallback}</div> : this.props.children;
  }
}
