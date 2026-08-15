import * as React from 'react'

interface ErrorBoundaryState {
  error: Error | null
}

/**
 * The app had NO error boundary: a single component throwing during render
 * unmounted the whole tree and left nothing but the dark <body> — i.e. a black
 * screen with zero diagnostics. This boundary turns that into a readable,
 * recoverable error panel instead of a silent void.
 */
export class ErrorBoundary extends React.Component<
  React.PropsWithChildren<Record<string, unknown>>,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Surface it in the console for the dev tools too.
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  private handleReload = () => {
    this.setState({ error: null })
    window.location.reload()
  }

  render() {
    if (this.state.error) {
      return (
        <div
          role="alert"
          className="mx-auto flex max-w-[640px] flex-col gap-4 p-8 font-mono text-sm text-ink"
        >
          <h1 className="text-lg font-semibold text-danger">页面渲染出错</h1>
          <p className="text-ink-3">
            某个组件在渲染时抛出了异常，已被错误边界捕获（不会再整页黑屏）。
          </p>
          <pre className="overflow-auto rounded-lg border border-line bg-surface-sunk p-4 text-danger">
            {this.state.error.message}
            {this.state.error.stack ? `\n\n${this.state.error.stack}` : ''}
          </pre>
          <button
            type="button"
            onClick={this.handleReload}
            className="hub-icon-btn w-fit"
          >
            重新加载
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
