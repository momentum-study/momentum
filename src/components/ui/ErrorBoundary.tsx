import { Component, type ReactNode } from 'react'

export class ErrorBoundary extends Component<{ children: ReactNode }> {
  state = { hasError: false, error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { hasError: true, error } }
  componentDidCatch(error: Error) { console.error('App Crashed:', error) }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen items-center justify-center p-4 text-center">
          <div>
            <h1 className="text-xl font-bold text-red-600">Something went wrong</h1>
            <p className="mt-2 text-sm text-slate-600">{this.state.error?.message ?? 'Unknown error'}</p>
            <button className="mt-4 rounded bg-primary-600 px-4 py-2 text-white" onClick={() => window.location.reload()}>Reload</button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
