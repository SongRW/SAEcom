import React from 'react'
import ReactDOM from 'react-dom/client'
import i18n from '@/shared/i18n'
import AboutWindow from '@/features/about/AboutWindow'

/** 独立窗渲染异常兜底，避免整窗白屏 */
class AboutErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[AboutWindow] render crashed:', error, info.componentStack)
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 16, fontFamily: 'monospace', fontSize: 12, color: '#b91c1c', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>{i18n.t('about.renderFailed')}</div>
          {String(this.state.error?.message || this.state.error)}
          {'\n\n'}
          {this.state.error?.stack || ''}
        </div>
      )
    }
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AboutErrorBoundary>
      <AboutWindow />
    </AboutErrorBoundary>
  </React.StrictMode>
)
