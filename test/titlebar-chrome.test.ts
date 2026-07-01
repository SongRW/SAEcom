import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi, afterEach } from 'vitest'
import { TitleBarChrome } from '@/features/titlebar/TitleBarChrome'

// WindowControls 仅 Linux 渲染：mock 为带标记占位，便于断言平台分支
vi.mock('@/features/titlebar/WindowControls', () => ({
  WindowControls: () => React.createElement('div', { 'data-testid': 'wc' }, 'WINDOWCONTROLS')
}))

afterEach(() => vi.restoreAllMocks())

describe('TitleBarChrome', () => {
  it('renders brand dot + title with drag region', () => {
    const html = renderToStaticMarkup(
      React.createElement(TitleBarChrome, { title: '测试标题' })
    )
    expect(html).toContain('app-region:drag')
    expect(html).toContain('测试标题')
    // 品牌点存在（size 任意值）
    expect(html).toMatch(/size-\[18px\]|w-\[18px\]/)
  })

  it('falls back to document.title when title prop omitted', () => {
    // vitest node 环境无 document，组件已对 typeof document 做防御；
    // 这里 stub 一个最小 document 验证回退逻辑。
    const orig = (globalThis as { document?: { title: string } }).document
    ;(globalThis as { document?: { title: string } }).document = { title: '文档标题' }
    try {
      const html = renderToStaticMarkup(React.createElement(TitleBarChrome))
      expect(html).toContain('文档标题')
    } finally {
      ;(globalThis as { document?: { title: string } }).document = orig
    }
  })

  it('renders status and right slots', () => {
    const html = renderToStaticMarkup(
      React.createElement(TitleBarChrome, {
        title: 'T',
        status: React.createElement('span', null, 'STATUS_MARKER'),
        right: React.createElement('span', null, 'RIGHT_MARKER')
      })
    )
    expect(html).toContain('STATUS_MARKER')
    expect(html).toContain('RIGHT_MARKER')
  })

  it('applies mac left padding (traffic lights) on mac platform', () => {
    vi.stubGlobal('navigator', { platform: 'MacIntel', userAgent: 'Mozilla/5.0 (Macintosh)' })
    const html = renderToStaticMarkup(React.createElement(TitleBarChrome, { title: 'T' }))
    expect(html).toContain('pl-[78px]')
    // mac 不渲染 WindowControls
    expect(html).not.toContain('WINDOWCONTROLS')
  })

  it('applies windows right padding on win platform', () => {
    vi.stubGlobal('navigator', { platform: 'Win32', userAgent: 'Mozilla/5.0 (Windows NT 10.0)' })
    const html = renderToStaticMarkup(React.createElement(TitleBarChrome, { title: 'T' }))
    expect(html).toContain('pr-[138px]')
    expect(html).not.toContain('WINDOWCONTROLS')
  })

  it('renders WindowControls on linux', () => {
    vi.stubGlobal('navigator', { platform: 'Linux x86_64', userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' })
    const html = renderToStaticMarkup(React.createElement(TitleBarChrome, { title: 'T' }))
    expect(html).toContain('WINDOWCONTROLS')
  })
})
