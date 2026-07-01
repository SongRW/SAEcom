import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { WindowControls } from '@/features/titlebar/WindowControls'

// mock useWindowControls：捕获点击回调
const minimize = vi.fn()
const toggleMaximize = vi.fn()
const close = vi.fn()
vi.mock('@/features/titlebar/useWindowControls', () => ({
  useWindowControls: () => ({ isMaximized: false, minimize, toggleMaximize, close })
}))

describe('WindowControls', () => {
  beforeEach(() => { [minimize, toggleMaximize, close].forEach((m) => m.mockClear()) })

  it('renders three buttons (minimize/maximize/close) with aria-labels', () => {
    const html = renderToStaticMarkup(React.createElement(WindowControls))
    expect(html).toContain('aria-label="最小化"')
    expect(html).toContain('aria-label="最大化"')
    expect(html).toContain('aria-label="关闭"')
    // 关闭按钮带 destructive 标记 class
    expect(html).toContain('hover:bg-destructive')
  })

  it('all buttons are no-drag', () => {
    const html = renderToStaticMarkup(React.createElement(WindowControls))
    expect(html).toContain('app-region:no-drag')
  })
})
