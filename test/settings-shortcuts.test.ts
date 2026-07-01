import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  SHORTCUTS,
  isMac,
  getDisplayCombo,
  handleShortcutKey,
  type ShortcutActions
} from '@/features/settings/shortcuts'

describe('shortcuts data table', () => {
  it('包含 5 条快捷键', () => {
    expect(SHORTCUTS).toHaveLength(5)
  })

  it('每条都有 id/label/combo', () => {
    for (const s of SHORTCUTS) {
      expect(s.id).toBeTruthy()
      expect(s.label).toBeTruthy()
      expect(s.combo).toBeTruthy()
    }
  })

  it('包含打开设置 Ctrl+,', () => {
    expect(SHORTCUTS.some((s) => s.id === 'settings' && s.combo === 'Ctrl+,')).toBe(true)
  })
})

describe('isMac', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', { platform: '' })
  })

  it('Mac 平台返回 true', () => {
    vi.stubGlobal('navigator', { platform: 'MacIntel' })
    expect(isMac()).toBe(true)
  })

  it('Win 平台返回 false', () => {
    vi.stubGlobal('navigator', { platform: 'Win32' })
    expect(isMac()).toBe(false)
  })
})

describe('getDisplayCombo', () => {
  it('Mac 下使用 platformCombo', () => {
    const s = { id: 'x', label: '侧边栏', combo: 'Ctrl+B', platformCombo: '⌘B' }
    expect(getDisplayCombo(s, true)).toBe('⌘B')
  })

  it('非 Mac 使用 combo', () => {
    const s = { id: 'x', label: '侧边栏', combo: 'Ctrl+B', platformCombo: '⌘B' }
    expect(getDisplayCombo(s, false)).toBe('Ctrl+B')
  })

  it('无 platformCombo 时回退到 combo', () => {
    const s = { id: 'x', label: '全屏', combo: 'F11' }
    expect(getDisplayCombo(s, true)).toBe('F11')
  })
})

// 构造最小 KeyboardEvent-like 对象(纯函数不依赖 DOM 事件构造器)
function key(opts: {
  key: string
  ctrlKey?: boolean
  metaKey?: boolean
  shiftKey?: boolean
  altKey?: boolean
  target?: unknown
}): KeyboardEvent {
  return {
    key: opts.key,
    ctrlKey: !!opts.ctrlKey,
    metaKey: !!opts.metaKey,
    shiftKey: !!opts.shiftKey,
    altKey: !!opts.altKey,
    target: (opts.target ?? null) as EventTarget,
    preventDefault: vi.fn()
  } as unknown as KeyboardEvent
}

describe('handleShortcutKey', () => {
  const actions: ShortcutActions = {
    openSettings: vi.fn(),
    toggleDark: vi.fn(),
    toggleFullscreen: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('Ctrl+, 命中并调用 openSettings', () => {
    const e = key({ key: ',', ctrlKey: true })
    expect(handleShortcutKey(e, actions)).toBe(true)
    expect(actions.openSettings).toHaveBeenCalledTimes(1)
    expect(e.preventDefault).toHaveBeenCalled()
  })

  it('Cmd+, 命中(mac 用 metaKey)', () => {
    const e = key({ key: ',', metaKey: true })
    expect(handleShortcutKey(e, actions)).toBe(true)
    expect(actions.openSettings).toHaveBeenCalledTimes(1)
  })

  it('Ctrl+Shift+L 命中并调用 toggleDark', () => {
    const e = key({ key: 'L', ctrlKey: true, shiftKey: true })
    expect(handleShortcutKey(e, actions)).toBe(true)
    expect(actions.toggleDark).toHaveBeenCalledTimes(1)
  })

  it('F11 命中并调用 toggleFullscreen', () => {
    const e = key({ key: 'F11' })
    expect(handleShortcutKey(e, actions)).toBe(true)
    expect(actions.toggleFullscreen).toHaveBeenCalledTimes(1)
  })

  it('未命中组合返回 false 且不调用任何 action', () => {
    const e = key({ key: 'x', ctrlKey: true })
    expect(handleShortcutKey(e, actions)).toBe(false)
    expect(actions.openSettings).not.toHaveBeenCalled()
    expect(actions.toggleDark).not.toHaveBeenCalled()
    expect(actions.toggleFullscreen).not.toHaveBeenCalled()
  })

  it('输入框 target 时不拦截(返回 false)', () => {
    const inputEl = { tagName: 'INPUT' } as HTMLElement
    const e = key({ key: ',', ctrlKey: true, target: inputEl })
    expect(handleShortcutKey(e, actions)).toBe(false)
    expect(actions.openSettings).not.toHaveBeenCalled()
  })
})
