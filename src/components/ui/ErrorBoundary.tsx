import { Component, type ReactNode } from 'react'

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

interface ErrorBoundaryProps {
  children: ReactNode
  /** Optional reset key — change this to force the error boundary to clear. */
  resetKey?: string | number
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null }
  static getDerivedStateFromError(error: Error): ErrorBoundaryState { return { hasError: true, error } }
  componentDidCatch(error: Error) { console.error('App Crashed:', error) }
  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false, error: null })
    }
  }
  retry = () => this.setState({ hasError: false, error: null })
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen flex-col items-center justify-center p-4 text-center">
          <h1 className="text-xl font-bold text-red-600">Something went wrong</h1>
          <p className="mt-2 max-w-md text-sm text-slate-600 dark:text-slate-300">
            {this.state.error?.message ?? 'Unknown error'}
          </p>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              className="rounded bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700"
              onClick={this.retry}
            >
              Try Again
            </button>
            <button
              type="button"
              className="rounded border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              onClick={() => window.location.reload()}
            >
              Reload Page
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}