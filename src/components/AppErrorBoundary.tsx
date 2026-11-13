import { Component, ErrorInfo, ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { failed: boolean }

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State { return { failed: true } }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Quorlyth render error:', error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="app-error">
        <section className="glass pad" role="alert">
          <h2>Quorlyth hit a snag.</h2>
          <p className="mut">Your work should still be saved. Reload the page to continue.</p>
          <button className="btn p" onClick={() => window.location.reload()}>Reload Quorlyth</button>
        </section>
      </main>
    )
  }
}
