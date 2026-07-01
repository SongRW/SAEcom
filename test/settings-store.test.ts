import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSettingsStore } from '@/shared/store/settings'

// vitest 为 node 环境(无 localStorage);settings.ts 的 loadFromStorage 读 localStorage,
// 故注入最小 shim。store 模块在首次 import 时执行 loadFromStorage,shim 必须在 import 前生效。
let store: Record<string, string> = {}
;(globalThis as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => (k in store ? store[k] : null),
  setItem: (k: string, v: string) => {
    store[k] = String(v)
  },
  removeItem: (k: string) => {
    delete store[k]
  },
  clear: () => {
    store = {}
  },
  key: () => null,
  length: 0
} as Storage

describe('settings store — fontSize', () => {
  beforeEach(() => {
    localStorage.clear()
    useSettingsStore.setState({
      fontSize: 14,
      dark: false,
      fullscreen: false,
      rxTimestamp: true,
      txTimestamp: true,
      confirmClear: true,
      confirmDelete: true,
      charEncoding: 'utf-8',
      bufferTime: 50,
      echoSend: false,
      longCommandThreshold: 80,
      autoCheckUpdate: true
    })
  })

  it('默认 fontSize 为 14', () => {
    expect(useSettingsStore.getState().fontSize).toBe(14)
  })

  it('setField 可修改 fontSize 并持久化', () => {
    useSettingsStore.getState().setField('fontSize', 18)
    expect(useSettingsStore.getState().fontSize).toBe(18)
    const stored = JSON.parse(localStorage.getItem('appSettings') || '{}')
    expect(stored.fontSize).toBe(18)
  })

  it('reset 把 fontSize 恢复为 14', () => {
    useSettingsStore.getState().setField('fontSize', 20)
    useSettingsStore.getState().reset()
    expect(useSettingsStore.getState().fontSize).toBe(14)
  })

  it('loadFromStorage 对越界 fontSize 回退到 14', () => {
    localStorage.setItem('appSettings', JSON.stringify({ fontSize: 99 }))
    // 重新 import 触发 loadFromStorage(新模块实例)
    vi.resetModules()
    return import('@/shared/store/settings').then(({ useSettingsStore: fresh }) => {
      expect(fresh.getState().fontSize).toBe(14)
    })
  })
})

describe('settings store — autoCheckUpdate', () => {
  it('默认 autoCheckUpdate 为 true', () => {
    expect(useSettingsStore.getState().autoCheckUpdate).toBe(true)
  })

  it('setField 可关闭并持久化', () => {
    useSettingsStore.getState().setField('autoCheckUpdate', false)
    expect(useSettingsStore.getState().autoCheckUpdate).toBe(false)
    const stored = JSON.parse(localStorage.getItem('appSettings') || '{}')
    expect(stored.autoCheckUpdate).toBe(false)
  })

  it('reset 恢复为 true', () => {
    useSettingsStore.getState().setField('autoCheckUpdate', false)
    useSettingsStore.getState().reset()
    expect(useSettingsStore.getState().autoCheckUpdate).toBe(true)
  })

  it('loadFromStorage 仅在显式 false 时关闭', () => {
    // 显式 false → 关闭
    localStorage.setItem('appSettings', JSON.stringify({ autoCheckUpdate: false }))
    vi.resetModules()
    return import('@/shared/store/settings').then(({ useSettingsStore: fresh }) => {
      expect(fresh.getState().autoCheckUpdate).toBe(false)
    })
  })
})
