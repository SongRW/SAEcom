import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, beforeEach } from 'vitest'
import '@/shared/i18n' // 初始化全局 i18next，供 ConnectionBadge 组件层 t() 使用
import { usePanelsStore } from '@/features/serial-panel/store'
import { ConnectionBadge, computeBadgeState } from '@/features/titlebar/ConnectionBadge'

/**
 * 测试策略（参考 test/active-panel-config.test.ts 的 SSR 说明）：
 * - 组件渲染层：验证不依赖 store 运行时 setState 的空状态（activeId=null → 不渲染）
 * - 状态计算层：computeBadgeState 纯函数，数据驱动覆盖四态，脱离 SSR 限制
 *
 * computeBadgeState 不调用 t()，仅产出稳定 labelKey/labelArg；文案翻译在组件层，
 * 因此纯函数测试断言 key 与 arg，不断言中文字符串。
 */
function seedStore(panels: Record<string, any>, activeId: string | null) {
  usePanelsStore.setState({ ...usePanelsStore.getState(), panels, activeId })
}

describe('computeBadgeState (pure)', () => {
  it('returns null when no active panel', () => {
    expect(computeBadgeState(undefined)).toBeNull()
    expect(computeBadgeState(null)).toBeNull()
  })

  it('returns disconnected when open=false', () => {
    const s = computeBadgeState({ id: 'COM3', open: false })
    expect(s).not.toBeNull()
    expect(s!.connected).toBe(false)
    expect(s!.labelKey).toBe('disconnected')
    expect(s!.labelArg).toBeUndefined()
  })

  it('uses panel.name when connected (name takes priority over id)', () => {
    const s = computeBadgeState({ id: 'COM3', name: '主串口', open: true })
    expect(s!.connected).toBe(true)
    expect(s!.labelKey).toBe('connected')
    expect(s!.labelArg).toBe('主串口')
  })

  it('falls back to id when name missing', () => {
    const s = computeBadgeState({ id: 'tcp://127.0.0.1:502', open: true })
    expect(s!.connected).toBe(true)
    expect(s!.labelKey).toBe('connected')
    expect(s!.labelArg).toBe('tcp://127.0.0.1:502')
  })

  it('falls back to id when name is empty string', () => {
    const s = computeBadgeState({ id: 'COM3', name: '', open: true })
    expect(s!.labelArg).toBe('COM3')
  })
})

describe('ConnectionBadge (component render, empty state)', () => {
  beforeEach(() => {
    seedStore({}, null)
  })

  it('renders nothing (empty html) when no active panel', () => {
    const html = renderToStaticMarkup(React.createElement(ConnectionBadge))
    expect(html).toBe('')
  })
})
