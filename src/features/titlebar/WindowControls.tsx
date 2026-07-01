import React from 'react'
import { useWindowControls } from '@/features/titlebar/useWindowControls'

/**
 * Linux 自绘窗口控件（最小化/最大化/关闭）。
 * 仅在 Linux 平台渲染（由 TitleBarChrome 按平台决定是否挂载）。
 * 关闭按钮 hover 用 destructive 色，类 macOS 红点的桌面习惯。
 */
export function WindowControls() {
  const { minimize, toggleMaximize, close } = useWindowControls()

  return (
    <div className="flex items-center [app-region:no-drag]">
      <button
        type="button"
        aria-label="最小化"
        title="最小化"
        onClick={minimize}
        className="flex size-8 items-center justify-center text-muted-foreground hover:bg-muted"
      >
        <svg width="10" height="10" viewBox="0 0 10 10"><rect y="4.5" width="10" height="1" fill="currentColor" /></svg>
      </button>
      <button
        type="button"
        aria-label="最大化"
        title="最大化"
        onClick={toggleMaximize}
        className="flex size-8 items-center justify-center text-muted-foreground hover:bg-muted"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor"><rect x="0.5" y="0.5" width="9" height="9" /></svg>
      </button>
      <button
        type="button"
        aria-label="关闭"
        title="关闭"
        onClick={close}
        className="flex size-8 items-center justify-center text-muted-foreground hover:bg-destructive hover:text-white"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor"><path d="M1 1L9 9M9 1L1 9" /></svg>
      </button>
    </div>
  )
}
