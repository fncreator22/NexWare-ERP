import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

interface Props {
  children?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in ErrorBoundary:', error, errorInfo)
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 m-4 rounded-2xl bg-rose-950/40 border border-rose-500/40 text-rose-200 text-center">
          <h2 className="text-lg font-bold mb-2">Something went wrong</h2>
          <p className="text-xs text-rose-300/80 mb-4">{this.state.error?.message || 'An unexpected runtime error occurred.'}</p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white font-semibold text-xs rounded-xl transition-all"
          >
            Try again
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
